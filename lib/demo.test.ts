import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resetDemo, resetDemoIfPresent, DEMO_SLUG } from "./demo";

// A fake admin client that records every call, so the test can prove the
// reset only ever touches the demo tenant and writes sensible data.
function fakeAdmin(demoExists = true) {
  const calls: { table: string; op: string; filters: [string, unknown][]; rows?: Record<string, unknown>[] }[] = [];
  let n = 0;
  const admin = {
    from(table: string) {
      const call = { table, op: "select", filters: [] as [string, unknown][], rows: undefined as Record<string, unknown>[] | undefined };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (call.filters.push([c, v]), chain),
        maybeSingle: async () => ({
          data: table === "tenants" && demoExists && call.filters.some(([c, v]) => c === "slug" && v === DEMO_SLUG)
            ? { id: "demo-tenant", site_key: "demo-key" }
            : null,
        }),
        single: async () => ({ data: { id: "demo-tenant", site_key: "demo-key" }, error: null }),
        delete: () => ((call.op = "delete"), chain),
        update: () => ((call.op = "update"), chain),
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          call.op = "insert";
          call.rows = Array.isArray(rows) ? rows : [rows];
          const ids = call.rows.map(() => ({ id: `id-${++n}` }));
          return { select: () => Promise.resolve({ data: ids, error: null }), then: (r: (v: unknown) => void) => r({ error: null }) };
        },
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    },
  };
  return { admin: admin as never, calls };
}

describe("resetDemo", () => {
  it("only ever deletes and updates the demo tenant's rows", async () => {
    const { admin, calls } = fakeAdmin();
    expect(await resetDemo(admin)).toBe("demo-tenant");
    const writes = calls.filter((c) => c.op === "delete" || c.op === "update");
    expect(writes.length).toBeGreaterThan(5);
    for (const w of writes) {
      expect(w.filters).toContainEqual([w.table === "tenants" ? "id" : "tenant_id", "demo-tenant"]);
    }
  });

  it("writes believable, safe data: demo tenant only, nothing in the future, example.com addresses", async () => {
    const { admin, calls } = fakeAdmin();
    await resetDemo(admin);
    const rows = calls.filter((c) => c.op === "insert").flatMap((c) => (c.rows ?? []).map((r) => ({ table: c.table, r })));
    expect(rows.length).toBeGreaterThan(300); // includes a month of website visits
    const now = Date.now();
    for (const { table, r } of rows) {
      if (table !== "project_team_members") expect(r.tenant_id).toBe("demo-tenant");
      for (const key of ["created_at", "received_at", "status_updated_at", "sent_at", "accepted_at"]) {
        if (typeof r[key] === "string") expect(Date.parse(r[key] as string)).toBeLessThanOrEqual(now);
      }
      for (const key of ["email", "customer_email"]) {
        if (typeof r[key] === "string") expect(r[key]).toMatch(/@example\.com$/);
      }
    }
    // Quote totals add up the way the dashboard itself works them out (12% markup, 20% VAT).
    const quote = rows.find(({ table, r }) => table === "quotes" && r.quote_number === "RL-0112")!.r;
    const cost = (quote.line_items as { unit_price_pence: number }[]).reduce((s, l) => s + l.unit_price_pence, 0);
    expect(quote.cost_subtotal_pence).toBe(cost);
    expect(quote.total_pence).toBe(Math.round(cost * 1.12) + (quote.vat_amount_pence as number));
  });

  it("the daily cron leaves things alone until the demo has been set up", async () => {
    const { admin, calls } = fakeAdmin(false);
    expect(await resetDemoIfPresent(admin)).toBe(false);
    expect(calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });
});

// The columns each table really has today, worked out from schema.sql and every
// migration in order - including the ones that dropped columns (034 removed the
// project cost columns, which is exactly what an earlier version of the demo
// still wrote to, and Supabase refused).
function liveColumns(): Map<string, Set<string>> {
  const dir = join(process.cwd(), "supabase");
  const files = [join(dir, "schema.sql"), ...readdirSync(join(dir, "migrations")).sort().map((f) => join(dir, "migrations", f))];
  const tables = new Map<string, Set<string>>();
  const cols = (t: string) => tables.get(t) ?? tables.set(t, new Set()).get(t)!;
  const skip = new Set(["unique", "primary", "constraint", "check", "foreign", "exclude"]);
  for (const file of files) {
    const sql = readFileSync(file, "utf8").replace(/--[^\n]*/g, "");
    const re = /create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);|alter table (?:if exists )?(\w+)\s+((?:add|drop) column[\s\S]*?);/gi;
    for (const m of sql.matchAll(re)) {
      if (m[1]) {
        for (const line of m[2].split("\n")) {
          const word = line.trim().split(/\s+/)[0]?.replace(/,$/, "");
          if (word && !skip.has(word.toLowerCase())) cols(m[1]).add(word);
        }
      } else {
        for (const part of m[4].split(/,\s*(?=(?:add|drop) column)/i)) {
          const hit = /(add|drop) column (?:if (?:not )?exists )?(\w+)/i.exec(part);
          if (!hit) continue;
          if (hit[1].toLowerCase() === "add") cols(m[3]).add(hit[2]);
          else cols(m[3]).delete(hit[2]);
        }
      }
    }
  }
  return tables;
}

describe("demo data matches the real database", () => {
  it("only writes columns that exist today", async () => {
    const { admin, calls } = fakeAdmin();
    await resetDemo(admin);
    const live = liveColumns();
    expect(live.get("projects")?.has("labour_cost_pence")).toBe(false); // dropped in 034 - the parser must know
    for (const c of calls.filter((c) => c.op === "insert")) {
      const known = live.get(c.table);
      expect(known, `table ${c.table}`).toBeTruthy();
      for (const row of c.rows ?? []) {
        for (const key of Object.keys(row)) expect(known!.has(key), `${c.table}.${key}`).toBe(true);
      }
    }
  });
});

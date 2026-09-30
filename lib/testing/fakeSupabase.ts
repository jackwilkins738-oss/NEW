import { randomUUID } from "node:crypto";

// An in-memory stand-in for the Supabase client, for testing whole flows
// (quote accepted -> job -> invoices) with the real code rather than a mock
// per call. It covers the query-builder calls this codebase uses - select
// (all columns; the list is ignored), eq/neq/in/is/ilike/gte/lte, order,
// limit, single/maybeSingle, insert/update/upsert/delete and rpc - and holds
// rows in plain arrays you can inspect. No RLS: it plays the service-role
// admin client (tenant isolation is proven against real Postgres in
// supabase/tests/rls.sql).

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const DEFAULTS: Record<string, () => Row> = {
  quotes: () => ({ accept_token: randomUUID(), status: "draft", created_at: new Date().toISOString() }),
  invoices: () => ({ view_token: randomUUID(), paid_pence: 0, status: "unpaid", sent_at: null, created_at: new Date().toISOString() }),
  projects: () => ({ portal_token: randomUUID(), created_at: new Date().toISOString() }),
  leads: () => ({ status: "new", created_at: new Date().toISOString() }),
  customers: () => ({ created_at: new Date().toISOString() }),
};

export type FakeDb = ReturnType<typeof createFakeSupabase>;

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const table = (name: string) => (tables[name] ??= []);
  const rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {
    increment_invoice_number: () => table("invoices").length + 1,
    increment_quote_number: () => table("quotes").length + 1,
  };

  function builder(name: string) {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let returning = false;
    let limitN: number | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let single: "one" | "maybe" | null = null;
    let headCount = false;

    const like = (pattern: string) =>
      new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");

    function run(): { data: unknown; error: { message: string } | null; count?: number } {
      const rows = table(name);
      if (op === "insert" || op === "upsert") {
        const items = (Array.isArray(payload) ? payload : [payload!]).map((p) => ({ id: randomUUID(), ...(DEFAULTS[name]?.() ?? {}), ...p }));
        for (const item of items) {
          const existing = op === "upsert" ? rows.find((r) => r.id === item.id) : undefined;
          if (existing) Object.assign(existing, item);
          else rows.push(item);
        }
        return finish(items);
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return finish(matched);
      }
      if (op === "delete") {
        tables[name] = rows.filter((r) => !matched.includes(r));
        return finish(matched);
      }
      if (order) {
        const { col, asc } = order;
        matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (limitN != null) matched = matched.slice(0, limitN);
      if (headCount) return { data: null, error: null, count: matched.length };
      return finish(matched);
    }

    function finish(result: Row[]) {
      if (op !== "select" && !returning) return { data: null, error: null };
      const copies = result.map((r) => ({ ...r }));
      if (single === "one") return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { message: `expected one row, got ${copies.length}` } };
      if (single === "maybe") return { data: copies[0] ?? null, error: null };
      return { data: copies, error: null };
    }

    const b = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op !== "select") returning = true;
        if (opts?.head) headCount = true;
        return b;
      },
      insert(p: Row | Row[]) { op = "insert"; payload = p; return b; },
      upsert(p: Row | Row[]) { op = "upsert"; payload = p; return b; },
      update(p: Row) { op = "update"; payload = p; return b; },
      delete() { op = "delete"; return b; },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return b; },
      neq(col: string, v: unknown) { filters.push((r) => r[col] !== v); return b; },
      in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return b; },
      is(col: string, v: unknown) { filters.push((r) => (r[col] ?? null) === v); return b; },
      ilike(col: string, p: string) { const re = like(p); filters.push((r) => re.test(String(r[col] ?? ""))); return b; },
      gte(col: string, v: unknown) { filters.push((r) => String(r[col]) >= String(v)); return b; },
      lte(col: string, v: unknown) { filters.push((r) => String(r[col]) <= String(v)); return b; },
      order(col: string, o?: { ascending?: boolean }) { order = { col, asc: o?.ascending !== false }; return b; },
      limit(n: number) { limitN = n; return b; },
      single() { single = "one"; return Promise.resolve(run()); },
      maybeSingle() { single = "maybe"; return Promise.resolve(run()); },
      then<T>(resolve: (v: ReturnType<typeof run>) => T, reject?: (e: unknown) => T) {
        try {
          return Promise.resolve(resolve(run()));
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return b;
  }

  const client = {
    from: (name: string) => builder(name),
    rpc: async (name: string, args: Record<string, unknown> = {}) => ({ data: rpcs[name]?.(args) ?? null, error: rpcs[name] ? null : { message: `no rpc ${name}` } }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: (table("users").find((u) => u.id === id) as { email?: string } | undefined) ?? null } }),
      },
    },
  };

  return { client, tables, table };
}

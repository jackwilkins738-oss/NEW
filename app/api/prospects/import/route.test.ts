import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// The real route against a fake Supabase admin client whose upsert refuses a teardown over a size limit,
// as the database did before migration 061 - proving one big row no longer sinks its whole batch.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";

const SECRET = "s".repeat(40);
const TENANT = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";
const jpeg = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}==`;

function fakeAdmin(limit: number) {
  const written: Record<string, unknown>[] = [];
  const admin = {
    from: vi.fn(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        neq: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: { id: TENANT }, error: null }),
        upsert: async (rows: Record<string, unknown>[]) => {
          if (rows.some((r) => r.teardown && JSON.stringify(r.teardown).length > limit)) {
            return { error: { message: 'new row for relation "prospects" violates check constraint "prospects_teardown_check"' } };
          }
          written.push(...rows);
          return { error: null };
        },
      };
      return chain;
    }),
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return written;
}

const req = (prospects: unknown[]) =>
  new Request("https://admin.scalardigital.co.uk/api/prospects/import", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT, prospects }),
  });

const at = "2026-10-06T09:00:00Z";
const small = { slug: "small-roofing-aaaaaa", business_name: "Small Roofing", website: "small.co.uk", mobile_score: 71, teardown: { checks: { https: true } }, teardown_at: at };
const big = {
  slug: "churchill-roofing-bbbbbb",
  business_name: "Churchill Roofing",
  website: "churchill.co.uk",
  mobile_score: 50,
  teardown: {
    checks: { tapToCall: false },
    frames: [0, 1, 2].map((i) => ({ t: i * 1000, img: jpeg(8000) })),
    screenshot: jpeg(30000),
  },
  teardown_at: at,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROSPECTS_API_SECRET = SECRET;
});

describe("POST /api/prospects/import", () => {
  it("lands the rest of a batch, and an over-size teardown without its pictures", async () => {
    const written = fakeAdmin(8192); // the old 8 KB limit
    const res = await POST(req([small, big]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, upserted: 2, failed: [], slimmed: ["churchill-roofing-bbbbbb"] });
    const churchill = written.find((r) => r.slug === "churchill-roofing-bbbbbb") as { teardown: Record<string, unknown>; mobile_score: number };
    expect(churchill.mobile_score).toBe(50);
    expect(churchill.teardown.checks).toEqual({ tapToCall: false });
    expect(churchill.teardown.frames).toBeUndefined();
    expect(written.some((r) => r.slug === "small-roofing-aaaaaa")).toBe(true);
  });

  it("keeps the pictures when the column allows them (migration 061)", async () => {
    const written = fakeAdmin(131072);
    const body = await (await POST(req([small, big]))).json();
    expect(body).toMatchObject({ upserted: 2, failed: [], slimmed: [] });
    const churchill = written.find((r) => r.slug === "churchill-roofing-bbbbbb") as { teardown: Record<string, unknown> };
    expect(churchill.teardown.frames).toHaveLength(3);
  });

  it("reports a row it still couldn't write, and writes the others", async () => {
    const written = fakeAdmin(10); // even the slimmed teardown is too big
    const body = await (await POST(req([small, big]))).json();
    expect(body.failed.map((f: { slug: string }) => f.slug)).toEqual(["small-roofing-aaaaaa", "churchill-roofing-bbbbbb"]);
    expect(body.upserted).toBe(0);
    expect(written).toHaveLength(0);
  });
});

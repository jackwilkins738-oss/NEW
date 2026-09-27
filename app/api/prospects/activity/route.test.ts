import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

// The real route handler against a fake Supabase admin client: proves the
// service secret gates it, the tenant id is checked, only engagement columns
// are asked for, and results past PostgREST's 1000-row cap are paged in.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";

const SECRET = "s".repeat(40);
const TENANT = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";
const url = (q = `?tenant_id=${TENANT}`) => `https://admin.scalardigital.co.uk/api/prospects/activity${q}`;
const req = (q?: string, auth = `Bearer ${SECRET}`) => new Request(url(q), { headers: { authorization: auth } });

function fakeAdmin(total: number) {
  const calls: { select: string; tenant: string; from: number; to: number }[] = [];
  const admin = {
    from: vi.fn(() => {
      const q = { select: "", tenant: "" };
      const chain = {
        select: (cols: string) => ((q.select = cols), chain),
        eq: (_col: string, val: string) => ((q.tenant = val), chain),
        order: () => chain,
        range: async (from: number, to: number) => {
          calls.push({ ...q, from, to });
          const n = Math.max(0, Math.min(to + 1, total) - from);
          return { data: Array.from({ length: n }, (_, i) => ({ slug: `firm-${from + i}`, view_count: 1 })), error: null };
        },
      };
      return chain;
    }),
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROSPECTS_API_SECRET = SECRET;
});

describe("GET /api/prospects/activity", () => {
  it("refuses without the service secret", async () => {
    const calls = fakeAdmin(3);
    expect((await GET(req(undefined, "Bearer wrong"))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("needs a tenant id that is a uuid", async () => {
    fakeAdmin(3);
    expect((await GET(req("?tenant_id=nope"))).status).toBe(400);
    expect((await GET(req(""))).status).toBe(400);
  });

  it("returns engagement facts only, for that tenant", async () => {
    const calls = fakeAdmin(3);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).prospects).toHaveLength(3);
    expect(calls[0].tenant).toBe(TENANT);
    expect(calls[0].select).toBe("slug, status, channel, view_count, first_viewed_at, last_viewed_at");
  });

  it("pages past the 1000-row cap", async () => {
    const calls = fakeAdmin(2500);
    const body = await (await GET(req())).json();
    expect(body.prospects).toHaveLength(2500);
    expect(calls.map((c) => c.from)).toEqual([0, 1000, 2000]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as engagement } from "./route";
import { POST as choice } from "../choice/route";

const SECRET = "s".repeat(40);
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

beforeEach(() => {
  rpcs.length = 0;
  rpcResult = { data: null, error: null };
  process.env.PROSPECTS_API_SECRET = SECRET;
  vi.mocked(createAdminClient).mockReturnValue({
    rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), rpcResult),
  } as never);
});

type Handler = (request: Request, props: { params: Promise<{ slug: string }> }) => Promise<Response>;
const call = (handler: Handler, body: unknown, slug = "kerr-roofing-1a2b3", auth = `Bearer ${SECRET}`) =>
  handler(new Request("https://admin.x/api", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ slug }),
  });

describe("POST /api/prospects/[slug]/engagement", () => {
  it("clamps the numbers and keeps only known sections", async () => {
    expect((await call(engagement, { seconds: 99999, scroll: 140, reached: ["pricing", "pricing", "evil", "rebuilt"] })).status).toBe(200);
    expect(rpcs[0]).toEqual({
      fn: "record_prospect_engagement",
      args: { p_slug: "kerr-roofing-1a2b3", p_seconds: 1800, p_scroll: 100, p_reached: ["pricing", "rebuilt"] },
    });
  });

  it("needs the service secret and a real slug; reports a missing migration", async () => {
    expect((await call(engagement, {}, undefined, "Bearer nope")).status).toBe(401);
    expect((await call(engagement, {}, "Bad/Slug")).status).toBe(404);
    rpcResult = { data: null, error: { message: "function record_prospect_engagement does not exist" } };
    expect((await call(engagement, { seconds: 5 })).status).toBe(503);
  });
});

describe("POST /api/prospects/[slug]/choice", () => {
  it("records a known choice and returns the firm from the database", async () => {
    rpcResult = { data: [{ business_name: "Kerr Roofing", trade: "roofer", area: "Leeds", view_count: 3, choice: "call" }], error: null };
    const res = await call(choice, { choice: "call" });
    expect(res.status).toBe(200);
    expect((await res.json()).prospect.business_name).toBe("Kerr Roofing");
    expect(rpcs[0]).toEqual({ fn: "record_prospect_choice", args: { p_slug: "kerr-roofing-1a2b3", p_choice: "call" } });
  });

  it("refuses an unknown choice and an unknown firm", async () => {
    expect((await call(choice, { choice: "spam" })).status).toBe(400);
    rpcResult = { data: [], error: null };
    expect((await call(choice, { choice: "not_now" })).status).toBe(404);
  });
});

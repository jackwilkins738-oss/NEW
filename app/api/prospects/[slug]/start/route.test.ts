import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
import { POST } from "./route";

const SECRET = "s".repeat(40);
const TENANT = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";
const SLUG = "kerr-roofing-4a7bc2";
const TERMS = "These are the terms of business for the website build, which the client signs when accepting.";
const call = (pkg = "build", slug = SLUG, auth = `Bearer ${SECRET}`) =>
  POST(new Request(`https://admin.scalardigital.co.uk/api/prospects/${slug}/start`, {
    method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ package: pkg }),
  }), { params: Promise.resolve({ slug }) });

function seed(extra: Record<string, unknown[]> = {}) {
  db = createFakeSupabase({
    tenants: [{ id: TENANT, site_key: "site-1", quote_number_prefix: "SD" }],
    prospects: [{ id: "p1", tenant_id: TENANT, slug: SLUG, business_name: "Kerr Roofing", status: "viewed" }],
    self_serve_quotes: [{ tenant_id: TENANT, package: "build", body: {
      line_items: [{ category: "labour", description: "The Scalar build", unit_price_pence: 250000 }],
      vat_rate: 0, deposit_percent: 50, terms: TERMS, payment_terms: "50% deposit", exclusions: "Hosting",
    } }],
    ...extra,
  });
}

beforeEach(() => {
  process.env.PROSPECTS_API_SECRET = SECRET;
});

describe("POST /api/prospects/[slug]/start", () => {
  it("makes their quote from the published package, with its terms and deposit", async () => {
    seed();
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, reused: false, business_name: "Kerr Roofing", quote_number: "SD-0001", total_pence: 250000 });
    expect(json.quote_url).toMatch(/^https:\/\/admin\.scalardigital\.co\.uk\/quote\//);
    const quote = db.table("quotes")[0];
    expect(quote).toMatchObject({ client_name: "Kerr Roofing", terms: TERMS, deposit_pence: 125000, reference: "Started online: build", status: "sent" });
    expect(db.table("onboarding")[0]).toMatchObject({ prospect_slug: SLUG });
  });

  it("pressing twice gives the same quote, not a second one", async () => {
    seed();
    const first = await (await call()).json();
    const again = await (await call()).json();
    expect(again).toMatchObject({ reused: true, quote_url: first.quote_url });
    expect(db.table("quotes")).toHaveLength(1);
  });

  it("refuses an unpublished package, an opted-out prospect, an unknown one, and no secret", async () => {
    seed();
    expect((await call("landing")).status).toBe(409);
    expect((await call("build", "nobody-123456")).status).toBe(404);
    expect((await call("build", SLUG, "Bearer nope")).status).toBe(401);
    expect((await call("everything")).status).toBe(400);
    db.table("prospects")[0].status = "lost";
    expect((await call()).status).toBe(409);
    expect(db.table("quotes")).toHaveLength(0);
  });
});

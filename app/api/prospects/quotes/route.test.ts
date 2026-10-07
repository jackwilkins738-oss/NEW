import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
import { GET } from "./route";

const SECRET = "s".repeat(40);
const TENANT = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";
const call = (tenant = TENANT, auth = `Bearer ${SECRET}`) =>
  GET(new Request(`https://admin.scalardigital.co.uk/api/prospects/quotes?tenant_id=${tenant}`, { headers: { authorization: auth } }));

const quote = (id: string, extra: Record<string, unknown> = {}) => ({
  id, tenant_id: TENANT, accept_token: `tok-${id}`, quote_number: `SD-${id}`, total_pence: 250000, status: "sent", expires_at: null,
  sent_at: "2026-10-01T09:00:00Z", created_at: "2026-10-01T09:00:00Z", view_count: 2, first_viewed_at: "2026-10-01T10:00:00Z",
  last_viewed_at: "2026-10-02T10:00:00Z", reference: "Started online: build", ...extra,
});

beforeEach(() => {
  process.env.PROSPECTS_API_SECRET = SECRET;
  db = createFakeSupabase({
    onboarding: [
      { quote_id: "q1", tenant_id: TENANT, prospect_slug: "kerr-roofing-4a7bc2", client_name: "Kerr Roofing" },
      { quote_id: "q2", tenant_id: TENANT, prospect_slug: "oak-lofts-111111", client_name: "Oak Lofts" },
      { quote_id: "q3", tenant_id: TENANT, prospect_slug: null, client_name: "A real client" },
      { quote_id: "q4", tenant_id: TENANT, prospect_slug: "old-222222", client_name: "Old" },
    ],
    quotes: [quote("q1"), quote("q2", { status: "accepted" }), quote("q3"), quote("q4", { expires_at: "2020-01-01" })],
  });
});

describe("GET /api/prospects/quotes", () => {
  it("lists prospects' open quotes with how often they've been opened", async () => {
    const json = await (await call()).json();
    expect(json.quotes).toEqual([{
      slug: "kerr-roofing-4a7bc2", business_name: "Kerr Roofing", quote_number: "SD-q1", total_pence: 250000,
      sent_at: "2026-10-01T09:00:00Z", view_count: 2, first_viewed_at: "2026-10-01T10:00:00Z", last_viewed_at: "2026-10-02T10:00:00Z",
      started_online: true, quote_url: "https://admin.scalardigital.co.uk/quote/q1/tok-q1",
    }]);
  });

  it("refuses strangers and a bad tenant", async () => {
    expect((await call(TENANT, "Bearer nope")).status).toBe(401);
    expect((await call("nope")).status).toBe(400);
  });
});

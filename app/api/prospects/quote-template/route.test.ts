import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
import { POST } from "./route";

const SECRET = "s".repeat(40);
const TENANT = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";
const TERMS = "These are the terms of business for the website build, which the client signs when accepting.";
const call = (body: unknown, auth = `Bearer ${SECRET}`) =>
  POST(new Request("https://admin.scalardigital.co.uk/api/prospects/quote-template", {
    method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
const quote = { line_items: [{ category: "labour", description: "Build", unit_price_pence: 250000 }], terms: TERMS, deposit_percent: 50, client_name: "ignored" };

beforeEach(() => {
  process.env.PROSPECTS_API_SECRET = SECRET;
  db = createFakeSupabase({});
});

describe("POST /api/prospects/quote-template", () => {
  it("stores the package's quote, without anything about a client", async () => {
    expect((await call({ tenant_id: TENANT, package: "build", quote })).status).toBe(200);
    const row = db.table("self_serve_quotes")[0];
    expect(row).toMatchObject({ tenant_id: TENANT, package: "build" });
    expect(row.body).toEqual({ line_items: quote.line_items, terms: TERMS, deposit_percent: 50 });
  });

  it("never stores a quote without terms or a price, or without the secret", async () => {
    expect((await call({ tenant_id: TENANT, package: "build", quote: { ...quote, terms: "" } })).status).toBe(400);
    expect((await call({ tenant_id: TENANT, package: "build", quote: { ...quote, line_items: [] } })).status).toBe(400);
    expect((await call({ tenant_id: TENANT, package: "logo", quote })).status).toBe(400);
    expect((await call({ tenant_id: TENANT, package: "build", quote }, "Bearer nope")).status).toBe(401);
    expect(db.table("self_serve_quotes")).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// The real handler against a fake admin client that records every write.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";

const SECRET = "s".repeat(40);
const TENANT = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";

type Write = { table: string; op: string; values?: Record<string, unknown>; filters: [string, unknown][] };

function fakeAdmin() {
  const writes: Write[] = [];
  const admin = {
    rpc: vi.fn(async () => ({ data: 7, error: null })),
    from: (table: string) => {
      const w: Write = { table, op: "select", filters: [] };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (w.filters.push([c, v]), chain),
        in: (c: string, v: unknown) => (w.filters.push([c, v]), writes.push(w), Promise.resolve({ error: null })),
        insert: (values: Record<string, unknown>) => ((w.op = "insert"), (w.values = values), writes.push(w), chain),
        update: (values: Record<string, unknown>) => ((w.op = "update"), (w.values = values), chain),
        maybeSingle: async () => ({ data: table === "tenants" ? { id: TENANT, site_key: "site-key-1", quote_number_prefix: "SD", default_quote_terms: "Saved terms", default_payment_terms: null } : null }),
        single: async () => ({ data: table === "leads" ? { id: "lead-1" } : { id: "quote-1", accept_token: "tok-1" }, error: null }),
      };
      return chain;
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return writes;
}

const req = (body: unknown, auth = `Bearer ${SECRET}`) =>
  new Request("https://admin.scalardigital.co.uk/api/prospects/quote", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const good = {
  tenant_id: TENANT,
  slug: "kerr-roofing-4a7bc2",
  client_name: "Kerr Roofing",
  email: "info@kerrroofing.co.uk",
  phone: "01483 111222",
  line_items: [{ category: "labour", description: "The Scalar build", unit_price_pence: 250000 }],
  vat_rate: 0,
  deposit_percent: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROSPECTS_API_SECRET = SECRET;
});

describe("POST /api/prospects/quote", () => {
  it("refuses without the service secret", async () => {
    const writes = fakeAdmin();
    expect((await POST(req(good, "Bearer nope"))).status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it("creates the lead and a numbered, sent quote, and returns its link on this app", async () => {
    const writes = fakeAdmin();
    const res = await POST(req(good));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, quote_number: "SD-0007", total_pence: 250000 });
    expect(body.quote_url).toBe("https://admin.scalardigital.co.uk/quote/quote-1/tok-1");

    const lead = writes.find((w) => w.table === "leads")!;
    expect(lead.values).toMatchObject({ tenant_id: TENANT, site_key: "site-key-1", name: "Kerr Roofing", status: "quoted", source: "outreach", value_pence: 250000 });
    const quote = writes.find((w) => w.table === "quotes")!;
    expect(quote.values).toMatchObject({ lead_id: "lead-1", status: "sent", vat_rate: 0, total_pence: 250000, deposit_pence: 125000, customer_email: "info@kerrroofing.co.uk" });
    const prospect = writes.find((w) => w.table === "prospects")!;
    expect(prospect.values).toMatchObject({ status: "replied" });
    const onboarding = writes.find((w) => w.table === "onboarding")!;
    expect(onboarding.values).toMatchObject({ quote_id: "quote-1", client_name: "Kerr Roofing", prospect_slug: "kerr-roofing-4a7bc2" });
    expect(String(onboarding.values!.token).length).toBeGreaterThanOrEqual(32);
    expect(prospect.filters).toContainEqual(["slug", "kerr-roofing-4a7bc2"]);
  });

  it("adds VAT only when asked, at 20%", async () => {
    fakeAdmin();
    const body = await (await POST(req({ ...good, vat_rate: 20 }))).json();
    expect(body.total_pence).toBe(300000);
  });

  it("the terms the customer signs travel with the quote", async () => {
    const writes = fakeAdmin();
    await POST(req({ ...good, terms: "1. Scope\n2. Payment", exclusions: "Domain fees", payment_terms: "50% deposit" }));
    expect(writes.find((w) => w.table === "quotes")!.values).toMatchObject({
      terms: "1. Scope\n2. Payment", exclusions: "Domain fees", payment_terms: "50% deposit",
    });
  });

  it("falls back to the business's saved terms, never none", async () => {
    const writes = fakeAdmin();
    await POST(req(good));
    expect(writes.find((w) => w.table === "quotes")!.values).toMatchObject({ terms: "Saved terms", exclusions: null });
  });

  it("rejects bad input", async () => {
    fakeAdmin();
    expect((await POST(req({ ...good, line_items: [] }))).status).toBe(400);
    expect((await POST(req({ ...good, email: "not-an-email" }))).status).toBe(400);
    expect((await POST(req({ ...good, tenant_id: "x" }))).status).toBe(400);
    expect((await POST(req({ ...good, line_items: [{ description: "x", unit_price_pence: 999_999_999 }] }))).status).toBe(400);
  });
});

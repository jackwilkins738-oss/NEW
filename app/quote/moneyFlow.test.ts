import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

// The money path, end to end, through the real code: a customer accepts a
// quote on the public page -> the job is created -> the deposit invoice is
// raised (and paid by card, or emailed) -> later the balance. Only the edges
// are faked: the database (lib/testing/fakeSupabase), email, push, request
// headers and after(). What this pins down is the behaviour that costs a
// business money or trust if it breaks: exactly one job, exactly one deposit
// invoice for the right amount, never a double on a second click, and the
// right people told.

const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => pending.push(fn()),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9", "user-agent": "Test browser" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => {}) }));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn(async () => {}) }));
let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

import { sendEmail } from "@/lib/email";
import { acceptQuote, declineQuote } from "./actions";
import { raiseJobInvoice } from "@/lib/jobs";

const TENANT = "t-ridgeview";
const QUOTE = "q-1";
const TOKEN = "0f8b3c1e-4a2d-4c6e-9b7a-1d2e3f4a5b6c";

function setup(opts: { deposit?: number | null; stripe?: boolean; autoSend?: boolean; email?: string | null } = {}) {
  db = createFakeSupabase({
    tenants: [{
      id: TENANT, business_name: "Ridgeview Lofts", slug: "ridgeview", domain: null, contact_email: "office@ridgeview.co.uk",
      invoice_number_prefix: "INV", stripe_account_id: opts.stripe ? "acct_123" : null, auto_send_deposit: !!opts.autoSend,
    }],
    memberships: [{ tenant_id: TENANT, user_id: "u-owner" }],
    users: [{ id: "u-owner", email: "sam@ridgeview.co.uk" }],
    leads: [{ id: "lead-1", tenant_id: TENANT, email: "jo@example.com", phone: "07700 900123", status: "quoted" }],
    quotes: [{
      id: QUOTE, tenant_id: TENANT, accept_token: TOKEN, status: "sent", client_name: "Jo Carrow", quote_number: "Q-0012",
      total_pence: 4_620_000, deposit_pence: opts.deposit === undefined ? 924_000 : opts.deposit,
      customer_email: opts.email === undefined ? "jo@example.com" : opts.email, customer_phone: null, lead_id: "lead-1",
    }],
  });
}

const sign = { name: "Jo Carrow", agreed: true };
const accept = async (token = TOKEN, signature: typeof sign | undefined = sign) => {
  const res = await acceptQuote(QUOTE, token, signature);
  await Promise.all(pending);
  return res;
};
const emails = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
const deposits = () => db.table("invoices").filter((i) => String(i.milestone).toLowerCase() === "deposit");

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
});

describe("optional extras ticked when accepting", () => {
  function withExtrasOnQuote() {
    setup({ deposit: 924_000 });
    Object.assign(db.table("quotes")[0], {
      line_items: [{ category: "other", description: "Loft conversion", unit_price_pence: 4_620_000 }],
      markup_percent: 0,
      vat_rate: 0,
      optional_items: [
        { description: "Velux blinds", price_pence: 60_000 },
        { description: "Extra socket run", price_pence: 30_000 },
      ],
    });
  }

  it("adds the ticked extras to the signed quote, total and deposit", async () => {
    withExtrasOnQuote();
    const res = await acceptQuote(QUOTE, TOKEN, sign, [1]);
    await Promise.all(pending);
    expect(res.ok).toBe(true);
    const q = db.table("quotes")[0];
    expect(q.total_pence).toBe(4_650_000);
    expect(q.deposit_pence).toBe(Math.round((924_000 * 4_650_000) / 4_620_000));
    expect((q.line_items as { description: string }[]).map((l) => l.description)).toEqual(["Loft conversion", "Extra socket run"]);
  });

  it("ignores extras that aren't on the quote, and never adds them twice", async () => {
    withExtrasOnQuote();
    await acceptQuote(QUOTE, TOKEN, sign, [9, -1]);
    expect(db.table("quotes")[0].total_pence).toBe(4_620_000);
    await acceptQuote(QUOTE, TOKEN, sign, [0]); // already accepted: nothing changes
    await Promise.all(pending);
    expect(db.table("quotes")[0].total_pence).toBe(4_620_000);
  });
});

describe("accepting a quote - who can, and what they have to do", () => {
  it("refuses a wrong token, and changes nothing", async () => {
    setup();
    expect(await accept("0f8b3c1e-4a2d-4c6e-9b7a-000000000000")).toEqual({ ok: false });
    expect(db.table("quotes")[0].status).toBe("sent");
    expect(db.table("projects")).toHaveLength(0);
  });

  it("needs a typed name and the box ticked the first time", async () => {
    setup();
    expect((await accept(TOKEN, { name: "", agreed: true })).ok).toBe(false);
    expect((await accept(TOKEN, { name: "Jo Carrow", agreed: false })).ok).toBe(false);
    expect(db.table("quotes")[0].status).toBe("sent");
  });

  it("can't accept a quote the customer already declined", async () => {
    setup();
    await declineQuote(QUOTE, TOKEN);
    expect((await accept()).ok).toBe(false);
    expect(db.table("projects")).toHaveLength(0);
  });

  it("records who signed, when, from where", async () => {
    setup();
    expect((await accept()).ok).toBe(true);
    const q = db.table("quotes")[0];
    expect(q.status).toBe("accepted");
    expect(q.accepted_name).toBe("Jo Carrow");
    expect(q.accepted_ip).toBe("203.0.113.9");
    expect(q.accepted_user_agent).toBe("Test browser");
  });
});

describe("accepted -> the job", () => {
  it("creates exactly one job for the full quote value, and marks the enquiry won", async () => {
    setup();
    await accept();
    expect(db.table("projects")).toHaveLength(1);
    const job = db.table("projects")[0];
    expect(job).toMatchObject({ tenant_id: TENANT, quote_id: QUOTE, lead_id: "lead-1", value_pence: 4_620_000, client_name: "Jo Carrow" });
    expect(db.table("leads")[0].status).toBe("won");
  });

  it("tells the business and gives the customer their copy of what they signed", async () => {
    setup();
    await accept();
    const toBusiness = emails().find((e) => e.subject.startsWith("Quote accepted"))!;
    expect(toBusiness.to.sort()).toEqual(["office@ridgeview.co.uk", "sam@ridgeview.co.uk"]);
    const toCustomer = emails().find((e) => e.subject.startsWith("You accepted"))!;
    expect(toCustomer.to).toEqual(["jo@example.com"]);
    expect(toCustomer.html).toContain('signed as "Jo Carrow"');
  });

  it("a second click (or a refresh) never makes a second job, invoice or round of emails", async () => {
    setup({ stripe: true });
    await accept();
    const sent = emails().length;
    vi.clearAllMocks();
    const again = await accept(TOKEN, undefined);
    expect(again.ok).toBe(true);
    expect(db.table("projects")).toHaveLength(1);
    expect(deposits()).toHaveLength(1);
    expect(emails()).toHaveLength(0);
    expect(sent).toBeGreaterThan(0);
  });
});

describe("the deposit", () => {
  it("with card payments on: one deposit invoice for the quote's deposit, and the customer is sent straight to pay it", async () => {
    setup({ stripe: true });
    const res = await accept();
    expect(deposits()).toHaveLength(1);
    const inv = deposits()[0];
    expect(inv.amount_pence).toBe(924_000);
    expect(inv.project_id).toBe(db.table("projects")[0].id);
    expect(res.depositUrl).toBe(`https://ridgeview.scalardigital.co.uk/invoice/${inv.id}/${inv.view_token}`);
    // The business's alert knows it was offered, rather than raising a second one.
    expect(emails().find((e) => e.subject.startsWith("Quote accepted"))!.html).toContain("offered their £9,240 deposit");
  });

  it("with auto-send on and no card payments: the deposit invoice is raised and emailed to the customer", async () => {
    setup({ autoSend: true });
    const res = await accept();
    expect(res.depositUrl).toBeNull();
    expect(deposits()).toHaveLength(1);
    expect(deposits()[0].sent_at).toBeTruthy();
    expect(emails().some((e) => e.subject.startsWith("Invoice from Ridgeview Lofts") && e.to[0] === "jo@example.com")).toBe(true);
  });

  it("with neither: nothing is raised on its own - the business is told what to invoice", async () => {
    setup();
    await accept();
    expect(deposits()).toHaveLength(0);
    expect(emails().find((e) => e.subject.startsWith("Quote accepted"))!.html).toContain("Their deposit is £9,240");
  });

  it("no deposit on the quote: no deposit invoice, whatever the settings", async () => {
    setup({ deposit: null, stripe: true, autoSend: true });
    const res = await accept();
    expect(deposits()).toHaveLength(0);
    expect(res.depositUrl).toBeNull();
  });
});

describe("then the balance", () => {
  it("is the quote total minus the deposit, raised once, and nothing is left after it", async () => {
    setup({ stripe: true });
    await accept();
    const jobId = db.table("projects")[0].id as string;
    const balance = await raiseJobInvoice(db.client as never, jobId, TENANT, "balance");
    expect(balance?.amountPence).toBe(4_620_000 - 924_000);
    expect(db.table("invoices").reduce((sum, i) => sum + Number(i.amount_pence), 0)).toBe(4_620_000);
    expect(await raiseJobInvoice(db.client as never, jobId, TENANT, "balance")).toBeNull();
    expect(await raiseJobInvoice(db.client as never, jobId, TENANT, "deposit")).toBeNull();
  });

  it("can't be raised for another business's job", async () => {
    setup({ stripe: true });
    await accept();
    const jobId = db.table("projects")[0].id as string;
    expect(await raiseJobInvoice(db.client as never, jobId, "t-someone-else", "balance")).toBeNull();
  });
});

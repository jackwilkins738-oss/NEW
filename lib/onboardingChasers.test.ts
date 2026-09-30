import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));
let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));

import { sendEmail } from "@/lib/email";
import { dueForOnboardingChase, sendOnboardingChasers, type ChaseOnboarding } from "./onboardingChasers";

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const base: ChaseOnboarding = {
  submitted_at: null,
  updated_at: ago(10),
  chase_count: 0,
  last_chased_at: null,
  quote: { status: "accepted", accepted_at: ago(2), customer_email: "bill@kerr.co.uk" },
};

describe("dueForOnboardingChase", () => {
  it("2 days after accepting, then 5 days after that, then never again", () => {
    expect(dueForOnboardingChase(base, now)).toBe(true);
    expect(dueForOnboardingChase({ ...base, quote: { ...base.quote!, accepted_at: ago(1) } }, now)).toBe(false);
    const once = { ...base, chase_count: 1, last_chased_at: ago(5) };
    expect(dueForOnboardingChase(once, now)).toBe(true);
    expect(dueForOnboardingChase({ ...once, last_chased_at: ago(4) }, now)).toBe(false);
    expect(dueForOnboardingChase({ ...once, chase_count: 2 }, now)).toBe(false);
  });

  it("leaves alone anyone who's sent it, is filling it in, or hasn't accepted", () => {
    expect(dueForOnboardingChase({ ...base, submitted_at: ago(1) }, now)).toBe(false);
    expect(dueForOnboardingChase({ ...base, updated_at: ago(1) }, now)).toBe(false); // saved an answer yesterday
    expect(dueForOnboardingChase({ ...base, quote: { ...base.quote!, status: "sent" } }, now)).toBe(false);
    expect(dueForOnboardingChase({ ...base, quote: { ...base.quote!, customer_email: null } }, now)).toBe(false);
    expect(dueForOnboardingChase({ ...base, quote: null }, now)).toBe(false);
  });
});

describe("sendOnboardingChasers", () => {
  const TOKEN = "t".repeat(40);
  function setup(row: Partial<Record<string, unknown>> = {}, quoteStatus = "accepted") {
    db = createFakeSupabase({
      tenants: [{ id: "scalar", business_name: "Scalar Digital", slug: "scalar", domain: "admin.scalardigital.co.uk", contact_email: "hello@scalardigital.co.uk" }],
      quotes: [{ id: "q1", tenant_id: "scalar", status: quoteStatus, accepted_at: ago(3), customer_email: "bill@kerr.co.uk" }],
      onboarding: [{
        id: "ob1", tenant_id: "scalar", token: TOKEN, client_name: "Kerr <Roofing>", quote_id: "q1", answers: { services: "Flat roofs" },
        submitted_at: null, updated_at: ago(10), chase_count: 0, last_chased_at: null, ...row,
      }],
    });
  }
  const emails = () => vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
  beforeEach(() => vi.clearAllMocks());

  it("sends the first reminder with their link and progress, escaped, and counts it", async () => {
    setup();
    expect(await sendOnboardingChasers()).toEqual({ checked: 1, sent: 1 });
    const [mail] = emails();
    expect(mail.to).toEqual(["bill@kerr.co.uk"]);
    expect(mail.html).toContain(`/welcome/ob1/${TOKEN}`);
    expect(mail.html).toContain("answered 1 of");
    expect(mail.html).toContain("Kerr &lt;Roofing&gt;");
    expect(db.table("onboarding")[0].chase_count).toBe(1);
    expect(await sendOnboardingChasers()).toEqual({ checked: 0, sent: 0 }); // not again tomorrow
  });

  it("the second reminder also tells the business to ring them", async () => {
    setup({ chase_count: 1, last_chased_at: ago(6) });
    await sendOnboardingChasers();
    expect(emails().map((e) => e.to[0])).toEqual(["bill@kerr.co.uk", "hello@scalardigital.co.uk"]);
    expect(emails()[1].subject).toContain("still hasn't sent");
  });

  it("never emails about a quote that wasn't accepted", async () => {
    setup({}, "sent");
    expect(await sendOnboardingChasers()).toEqual({ checked: 0, sent: 0 });
    expect(emails()).toHaveLength(0);
  });
});

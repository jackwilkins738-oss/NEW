import { describe, it, expect, vi, beforeEach } from "vitest";

// The real handler, with the database, email and after() faked: the owner's
// alert carries the whole enquiry (so they can act without logging in), goes
// to the business's contact email as well as its logins, and is actually
// awaited via after() rather than left floating.
const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => pending.push(fn()),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { POST } from "./route";

const TENANT = { id: "t1", business_name: "Kerr <Roofing>", site_key: "key-1", domain: null, slug: "kerr", brand_theme: "rust", contact_email: "office@kerr.co.uk" };

const inserted: Record<string, unknown>[] = [];

function fakeAdmin(members: string[]) {
  const admin = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gte: () => Promise.resolve({ count: 0 }),
        maybeSingle: async () => ({ data: table === "tenants" ? TENANT : null }),
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return chain;
        },
        single: async () => ({ data: { id: "lead-1" }, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: members.map((id) => ({ user_id: id })) }),
      };
      return chain;
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@kerr.co.uk` } } }) } },
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
}

const post = (body: Record<string, unknown>) =>
  POST(new Request("https://admin.scalardigital.co.uk/api/leads", { method: "POST", body: JSON.stringify(body) }));

const lead = { tenant_id: "t1", site_key: "key-1", name: "Sue <b>Hart</b>", email: "sue@example.com", phone: "07700 900 123", message: "Leak over the bay window\nCan you come Friday?", source: "Website" };

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  inserted.length = 0;
});

describe("POST /api/leads - the owner's alert", () => {
  it("carries the whole enquiry, escaped, with tap-to-call, to logins and the contact email", async () => {
    fakeAdmin(["owner"]);
    expect((await post(lead)).status).toBe(200);
    await Promise.all(pending);
    const alert = vi.mocked(sendEmail).mock.calls.map((c) => c[0]).find((e) => e.subject.startsWith("New enquiry"))!;
    expect(alert.to.sort()).toEqual(["office@kerr.co.uk", "owner@kerr.co.uk"]);
    expect(alert.replyTo).toBe("sue@example.com");
    expect(alert.html).toContain('href="tel:07700900123"');
    expect(alert.html).toContain("Leak over the bay window\nCan you come Friday?");
    expect(alert.html).toContain("Sue &lt;b&gt;Hart&lt;/b&gt;");
    expect(alert.html).not.toContain("<b>Hart</b>");
    expect(alert.html).toContain("View on your dashboard");
  });

  it("a landing-page client with no login still gets it, without a dashboard button", async () => {
    fakeAdmin([]);
    await post(lead);
    await Promise.all(pending);
    const alert = vi.mocked(sendEmail).mock.calls.map((c) => c[0]).find((e) => e.subject.startsWith("New enquiry"))!;
    expect(alert.to).toEqual(["office@kerr.co.uk"]);
    expect(alert.html).not.toContain("View on your dashboard");
    expect(alert.html).toContain("Call them now");
  });

  it("a wrong site key saves and sends nothing", async () => {
    fakeAdmin(["owner"]);
    expect((await post({ ...lead, site_key: "nope" })).status).toBe(404);
    expect(pending).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});


describe("POST /api/leads - a public endpoint, so nothing typed is trusted", () => {
  it("escapes the visitor's name in the auto-reply, so it can't carry a link in the business's name", async () => {
    fakeAdmin(["owner"]);
    await post({ ...lead, name: '<a href="https://evil.example">Verify</a> now' });
    await Promise.all(pending);
    const reply = vi.mocked(sendEmail).mock.calls.map((c) => c[0]).find((e) => e.subject.startsWith("Thanks for getting in touch"))!;
    expect(reply.html).not.toContain("<a href");
    expect(reply.html).toContain("&lt;a");
    expect(reply.html).toContain("Kerr &lt;Roofing&gt;");
  });

  it("sends no auto-reply to something that isn't an email address", async () => {
    fakeAdmin(["owner"]);
    await post({ ...lead, email: "not an email <x@y.z>" });
    await Promise.all(pending);
    expect(vi.mocked(sendEmail).mock.calls.some((c) => c[0].subject.startsWith("Thanks for getting in touch"))).toBe(false);
    // Kept on the enquiry for the business to see, just never emailed.
    expect(inserted[0].email).toBe("not an email <x@y.z>");
    const alert = vi.mocked(sendEmail).mock.calls.map((c) => c[0]).find((e) => e.subject.startsWith("New enquiry"))!;
    expect(alert.replyTo).toBeUndefined();
  });

  it("trims every field to a sane length before storing it", async () => {
    fakeAdmin(["owner"]);
    await post({ ...lead, name: "n".repeat(1000), message: "m".repeat(20000), source: "s".repeat(500), phone: "1".repeat(200) });
    const row = inserted[0] as Record<string, string>;
    expect(row.name.length).toBe(120);
    expect(row.message.length).toBe(5000);
    expect(row.source.length).toBe(100);
    expect(row.phone.length).toBe(40);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => pending.push(fn()),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { feedbackMessage } from "@/lib/changeRequests";
import { POST } from "./route";

const TENANT = { id: "t1", site_key: "key-1", business_name: "Kerr Roofing" };
let inserted: Record<string, unknown>[] = [];
let recent = 0;

function fakeAdmin() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        like: () => chain,
        gte: () => Promise.resolve({ count: recent }),
        maybeSingle: async () => ({ data: table === "tenants" ? TENANT : null }),
        insert: async (row: Record<string, unknown>) => (inserted.push({ table, ...row }), { error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: table === "platform_admins" ? [{ user_id: "u1" }] : [] }),
      };
      return chain;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "ash@scalardigital.co.uk" } } }) } },
  };
}

const post = (body: unknown) =>
  POST(new Request("https://admin.x/api/site-feedback", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  inserted = [];
  recent = 0;
  pending.length = 0;
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);
  vi.mocked(sendEmail).mockClear();
});

describe("feedbackMessage", () => {
  it("formats a pin and cleans every field", () => {
    expect(feedbackMessage({ page: "/services.html<script>", near: "Flat   roofs", x: 140, y: -3, comment: "Swap this photo", name: "Sam" }))
      .toBe('[Draft site feedback] /services.htmlscript - near "Flat roofs" (100% across, 0% down) - from Sam\nSwap this photo');
    expect(feedbackMessage({ comment: " " })).toBeNull();
  });
});

describe("POST /api/site-feedback", () => {
  const good = { tenant_id: "t1", site_key: "key-1", page: "/", near: "Hero", x: 40, y: 20, comment: "Use our van photo here" };

  it("files the pin as a change request and emails the admins", async () => {
    const res = await post(good);
    await Promise.all(pending);
    expect(res.status).toBe(200);
    expect(inserted).toEqual([{ table: "change_requests", tenant_id: "t1", message: expect.stringContaining("Use our van photo here") }]);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("refuses a wrong site key, an empty comment and a burst - without saying which", async () => {
    expect((await post({ ...good, site_key: "nope" })).status).toBe(404);
    expect((await post({ ...good, comment: "" })).status).toBe(400);
    recent = 40;
    expect((await post(good)).status).toBe(404);
    expect(inserted).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// The public onboarding actions against a fake admin client: the token is
// checked on every call, uploads can't escape their folder, and the first
// "Send to us" tells the business owner exactly once.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn(async () => {}) }));
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { finishUpload, saveOnboarding, startUpload } from "./actions";

const TOKEN = "t".repeat(32);
const TENANT = "tenant-1";
let row: Record<string, unknown>;
let updates: Record<string, unknown>[];
let inserts: Record<string, unknown>[];
let stored: { name: string; metadata: { size: number } }[];

function fakeAdmin() {
  const admin = {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === "onboarding" ? row : { contact_email: "jack@scalar.co.uk", domain: null, slug: "admin" } }),
        update: (v: Record<string, unknown>) => (updates.push(v), { eq: async () => ({ error: null }) }),
        insert: (v: Record<string, unknown>) => (inserts.push(v), { select: () => ({ single: async () => ({ data: { id: "f1", ...v }, error: null }) }) }),
        then: (resolve: (v: unknown) => void) => resolve({ count: 0 }),
      };
      return chain;
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { token: "up-tok", path }, error: null }),
        list: async () => ({ data: stored }),
      }),
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  row = { id: "ob-1", tenant_id: TENANT, token: TOKEN, client_name: "Kerr Roofing", answers: {}, submitted_at: null };
  updates = [];
  inserts = [];
  stored = [];
  fakeAdmin();
});

describe("onboarding actions", () => {
  it("refuses a wrong token and writes nothing", async () => {
    expect((await saveOnboarding("ob-1", "x".repeat(32), { phone: "1" }, true)).ok).toBe(false);
    expect((await startUpload("ob-1", "short", { name: "a.jpg", type: "image/jpeg", size: 10 }, "photo")).ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("saves only known answers, and the first send emails the owner once", async () => {
    const res = await saveOnboarding("ob-1", TOKEN, { phone: " 01483 111222 ", hacker: "<script>" }, true);
    expect(res).toMatchObject({ ok: true, answered: 1 });
    expect(updates[0].answers).toEqual({ phone: "01483 111222" });
    expect(updates[0].submitted_at).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    row.submitted_at = "2026-09-28T10:00:00Z";
    await saveOnboarding("ob-1", TOKEN, { phone: "01483 111222" }, true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("puts uploads in the client's own folder under a safe name", async () => {
    const res = await startUpload("ob-1", TOKEN, { name: "../../x.jpg", type: "image/jpeg", size: 2_000_000 }, "photo");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.path).toMatch(new RegExp(`^${TENANT}/ob-1/[0-9a-f-]{36}-x\\.jpg$`));
    const svg = await startUpload("ob-1", TOKEN, { name: "logo.svg", type: "image/svg+xml", size: 100 }, "logo");
    expect(svg.ok).toBe(false);
  });

  it("only records a file that is in its folder and actually arrived", async () => {
    expect((await finishUpload("ob-1", TOKEN, `other-tenant/ob-1/a.jpg`, "photo", "a.jpg")).ok).toBe(false);
    expect((await finishUpload("ob-1", TOKEN, `${TENANT}/ob-1/sub/a.jpg`, "photo", "a.jpg")).ok).toBe(false);
    expect((await finishUpload("ob-1", TOKEN, `${TENANT}/ob-1/a.jpg`, "photo", "a.jpg")).ok).toBe(false); // not in storage
    stored = [{ name: "a.jpg", metadata: { size: 1234 } }];
    const ok = await finishUpload("ob-1", TOKEN, `${TENANT}/ob-1/a.jpg`, "photo", "a.jpg");
    expect(ok.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ kind: "photo", size_bytes: 1234, tenant_id: TENANT });
  });
});

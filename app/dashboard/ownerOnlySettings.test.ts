import { describe, it, expect, vi, beforeEach } from "vitest";

// updateTenantSettings and uploadTenantLogo used to check only "is this
// user a member of this tenant" (any role), even though the Settings page
// that renders their forms is owner-only (a member is redirected away).
// Since Server Actions are independently reachable, a member could call
// either directly and rewrite bank_details (shown on customer invoices) or
// the tenant's logo. This proves the fix: both now require role==="owner".
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/membershipRole", () => ({ getCurrentUserRole: vi.fn() }));
vi.mock("@/lib/calendarConnection", () => ({ getCalendarConnection: vi.fn(), getValidAccessToken: vi.fn() }));
vi.mock("@/lib/googleCalendar", () => ({ upsertEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { updateTenantSettings, uploadTenantLogo } from "./actions";

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateAdminClient = vi.mocked(createAdminClient);
const mockedGetCurrentUserRole = vi.mocked(getCurrentUserRole);

function fakeSupabase(user: { id: string } | null, storageUploadError: unknown = null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: storageUploadError }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/logo.png" } }),
      }),
    },
  };
}

function fakeAdmin() {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return { from: vi.fn().mockReturnValue({ update }), _update: update };
}

function logoFormData(tenantId: string) {
  const fd = new FormData();
  fd.set("tenantId", tenantId);
  fd.set("logo", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));
  return fd;
}

function settingsFormData() {
  return new FormData();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateTenantSettings", () => {
  it("SECURITY: does not write when the caller is a member, not an owner (bank_details is customer-facing)", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "member-user" }) as never);
    mockedGetCurrentUserRole.mockResolvedValue("member");
    const admin = fakeAdmin();
    mockedCreateAdminClient.mockReturnValue(admin as never);

    await updateTenantSettings("tenant-1", settingsFormData());

    expect(admin.from).not.toHaveBeenCalled();
  });

  it("writes when the caller is the tenant's owner", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "owner-user" }) as never);
    mockedGetCurrentUserRole.mockResolvedValue("owner");
    const admin = fakeAdmin();
    mockedCreateAdminClient.mockReturnValue(admin as never);

    await updateTenantSettings("tenant-1", settingsFormData());

    expect(admin.from).toHaveBeenCalledWith("tenants");
  });
});

describe("uploadTenantLogo", () => {
  it("SECURITY: does not upload when the caller is a member, not an owner", async () => {
    const supabase = fakeSupabase({ id: "member-user" });
    mockedCreateClient.mockResolvedValue(supabase as never);
    mockedGetCurrentUserRole.mockResolvedValue("member");

    await uploadTenantLogo(logoFormData("tenant-1"));

    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("uploads when the caller is the tenant's owner", async () => {
    const supabase = fakeSupabase({ id: "owner-user" });
    mockedCreateClient.mockResolvedValue(supabase as never);
    mockedGetCurrentUserRole.mockResolvedValue("owner");
    mockedCreateAdminClient.mockReturnValue(fakeAdmin() as never);

    await uploadTenantLogo(logoFormData("tenant-1"));

    expect(supabase.storage.from).toHaveBeenCalledWith("tenant-assets");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { decodeState } from "@/lib/stripe";

// Everything BUT lib/stripe is mocked - encodeState/decodeState/
// buildConnectUrl are the actual security-critical logic under test here,
// so they run for real. This exercises the real, imported route handler
// (not a re-implementation of its logic), which is what actually proves
// the membership check fires - a pure code read can't catch a wiring bug
// like "the check exists but the route returns before reaching it."
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentTenant: vi.fn() }));
vi.mock("@/lib/membershipRole", () => ({ getCurrentUserRole: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { getCurrentUserRole } from "@/lib/membershipRole";

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentTenant = vi.mocked(getCurrentTenant);
const mockedGetCurrentUserRole = vi.mocked(getCurrentUserRole);

function fakeSupabase(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.STRIPE_CLIENT_ID = "ca_test_client_id";
});

describe("GET /api/stripe/connect", () => {
  it("redirects to /login when no session exists", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase(null));

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/stripe/connect"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/login");
    expect(mockedGetCurrentTenant).not.toHaveBeenCalled();
  });

  it("redirects to /login when getCurrentTenant resolves to no tenant", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "user-1" }));
    mockedGetCurrentTenant.mockResolvedValue(null);

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/stripe/connect"));

    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/login");
    expect(mockedGetCurrentUserRole).not.toHaveBeenCalled();
  });

  it("redirects to /login when the signed-in user is NOT a member of the resolved tenant (the actual fix)", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "attacker-user" }));
    mockedGetCurrentTenant.mockResolvedValue({ id: "victim-tenant-id" } as never);
    mockedGetCurrentUserRole.mockResolvedValue(null);

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/stripe/connect"));

    expect(mockedGetCurrentUserRole).toHaveBeenCalledWith(expect.anything(), "victim-tenant-id", "attacker-user");
    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/login");
  });

  it("mints a state for a real member, and that state decodes back to exactly that tenant+user", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "real-owner" }));
    mockedGetCurrentTenant.mockResolvedValue({ id: "real-tenant-id" } as never);
    mockedGetCurrentUserRole.mockResolvedValue("owner");

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/stripe/connect"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://connect.stripe.com");
    const state = location.searchParams.get("state")!;
    expect(state).toBeTruthy();

    const decoded = decodeState(state);
    expect(decoded).toEqual({
      tenantId: "real-tenant-id",
      userId: "real-owner",
      returnTo: "https://admin.scalardigital.co.uk/settings",
    });
  });
});

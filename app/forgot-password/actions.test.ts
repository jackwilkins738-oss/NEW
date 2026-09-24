import { describe, it, expect, vi, beforeEach } from "vitest";

// requestPasswordReset used to build the reset link straight from the raw
// Host header - a forged header would make Supabase mail a reset link
// pointing at an attacker's domain. The fix routes it through
// getCurrentTenant(), which only resolves a host that matches a real
// tenant's domain/slug. These tests prove that wiring, not just that the
// function exists.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getCurrentTenant: vi.fn() }));

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { requestPasswordReset } from "./actions";

const mockedRedirect = vi.mocked(redirect);
const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentTenant = vi.mocked(getCurrentTenant);

function fakeSupabase() {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  return { client: { auth: { resetPasswordForEmail } } as never, resetPasswordForEmail };
}

function formWith(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  it("SECURITY: sends no reset link when the host doesn't resolve to a real tenant (forged/unrecognised Host header)", async () => {
    const { client, resetPasswordForEmail } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);
    mockedGetCurrentTenant.mockResolvedValue(null);

    await requestPasswordReset(formWith("victim@example.com"));

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith("/forgot-password?sent=1");
  });

  it("builds the redirect URL from the resolved tenant's own domain, not the request's Host header", async () => {
    const { client, resetPasswordForEmail } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);
    mockedGetCurrentTenant.mockResolvedValue({
      id: "t1",
      domain: "dashboard.ridgeviewlofts.co.uk",
      slug: "ridgeview",
    } as never);

    await requestPasswordReset(formWith("owner@ridgeviewlofts.co.uk"));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@ridgeviewlofts.co.uk", {
      redirectTo: "https://dashboard.ridgeviewlofts.co.uk/reset-password",
    });
  });

  it("falls back to the tenant's slug subdomain when no custom domain is set", async () => {
    const { client, resetPasswordForEmail } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);
    mockedGetCurrentTenant.mockResolvedValue({ id: "t1", domain: null, slug: "ridgeview" } as never);

    await requestPasswordReset(formWith("owner@ridgeviewlofts.co.uk"));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@ridgeviewlofts.co.uk", {
      redirectTo: "https://ridgeview.scalardigital.co.uk/reset-password",
    });
  });

  it("does nothing but redirect when no email is submitted", async () => {
    const { resetPasswordForEmail } = fakeSupabase();
    mockedGetCurrentTenant.mockResolvedValue({ id: "t1", domain: null, slug: "ridgeview" } as never);

    await requestPasswordReset(formWith(""));

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith("/forgot-password?sent=1");
  });
});

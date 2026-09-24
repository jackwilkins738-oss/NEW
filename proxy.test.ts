import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { proxy } from "./proxy";

const mockedCreateServerClient = vi.mocked(createServerClient);

function fakeSupabase(opts: {
  user: { id: string } | null;
  currentLevel?: "aal1" | "aal2";
  nextLevel?: "aal1" | "aal2";
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user } }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: opts.currentLevel ?? "aal1", nextLevel: opts.nextLevel ?? "aal1" },
        }),
      },
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Real proof that the gate this app depends on for 2FA actually redirects,
// not just that getAuthenticatorAssuranceLevel() is called somewhere - a
// wiring bug (checking the wrong field, an inverted condition, an exempt
// list that's too broad) would pass a code review but fail these.
describe("proxy() - AAL2 gate", () => {
  it("passes through untouched when there's no session at all", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: null }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/dashboard"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when the user has no MFA factor enrolled (nextLevel never reaches aal2)", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal1" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/dashboard"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when the user already completed aal2 this session", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal2", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/settings"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("SECURITY: redirects to /mfa-challenge when a factor is enrolled but not yet verified this session", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/settings"));

    const location = res.headers.get("location");
    expect(location).toContain("/mfa-challenge");
    expect(location).toContain("returnTo=%2Fsettings");
  });

  it("does NOT redirect /login even when aal2 is pending, to avoid a loop", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/login"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("does NOT redirect /mfa-challenge itself, to avoid a loop", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/mfa-challenge"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("does NOT redirect a public token page (no user-session auth model to gate)", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/portal/abc-123/tok-456"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("does NOT redirect the Stripe OAuth callback (no user-session auth model to gate)", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://admin.scalardigital.co.uk/api/stripe/callback?code=x&state=y"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("does NOT redirect a webhook or cron route (signature/secret auth, not a user session)", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const webhook = await proxy(new NextRequest("https://admin.scalardigital.co.uk/api/webhooks/stripe"));
    const cron = await proxy(new NextRequest("https://admin.scalardigital.co.uk/api/cron/weekly-digest"));

    expect(webhook.headers.get("location")).toBeNull();
    expect(cron.headers.get("location")).toBeNull();
  });

  it("SECURITY: redirects a session-authenticated API route, not just pages - a blanket /api/ exemption would let an aal1-only session skip 2FA entirely to pull tenant data", async () => {
    mockedCreateServerClient.mockReturnValue(fakeSupabase({ user: { id: "u1" }, currentLevel: "aal1", nextLevel: "aal2" }));

    const res = await proxy(new NextRequest("https://ridgeview.example.com/api/export/invoices?tenantId=t1"));

    expect(res.headers.get("location")).toContain("/mfa-challenge");
  });
});

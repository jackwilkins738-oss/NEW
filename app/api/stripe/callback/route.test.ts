import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { encodeState } from "@/lib/stripe";

// lib/stripe's encodeState/decodeState run for real (that's the fix under
// test) - only the Stripe API call and the Supabase admin client are
// mocked, since those need real network/DB access this test suite can't
// have. This exercises the actual imported route handler end to end.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return { ...actual, exchangeConnectCode: vi.fn() };
});
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeConnectCode } from "@/lib/stripe";

const mockedCreateAdminClient = vi.mocked(createAdminClient);
const mockedExchangeConnectCode = vi.mocked(exchangeConnectCode);

function fakeAdminClient() {
  const eq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as never, from, update, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

describe("GET /api/stripe/callback", () => {
  it("redirects with an error and touches nothing when code/state are missing", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/stripe/callback"));

    expect(res.headers.get("location")).toContain("stripe=error");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("SECURITY: a forged state (never issued by /connect) is rejected and never reaches the database update", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);

    // An attacker who never went through /api/stripe/connect can't produce a
    // validly-signed payload - this is exactly what a forged {tenantId,
    // returnTo} blob (the pre-fix vulnerability) looks like: real-looking
    // JSON, no valid signature to go with it.
    const forgedPayload = Buffer.from(
      JSON.stringify({ tenantId: "victim-tenant-id", userId: "attacker", returnTo: "https://evil.example", iat: Date.now() })
    ).toString("base64url");
    const forgedState = `${forgedPayload}.not-a-real-signature`;

    const res = await GET(
      new Request(`https://admin.scalardigital.co.uk/api/stripe/callback?code=stripe_auth_code&state=${forgedState}`)
    );

    expect(res.headers.get("location")).toContain("stripe=error");
    // The whole point of the fix: forged state must never result in a write.
    expect(admin.from).not.toHaveBeenCalled();
    expect(mockedExchangeConnectCode).not.toHaveBeenCalled();
  });

  it("SECURITY: an expired (>10min old) state, even with a correct signature, is rejected", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);

    const crypto = await import("crypto");
    const stalePayload = Buffer.from(
      JSON.stringify({
        tenantId: "real-tenant",
        userId: "real-user",
        returnTo: "https://admin.scalardigital.co.uk/settings",
        iat: Date.now() - 11 * 60 * 1000,
      })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", "test-service-role-key").update(stalePayload).digest("base64url");
    const staleState = `${stalePayload}.${sig}`;

    const res = await GET(
      new Request(`https://admin.scalardigital.co.uk/api/stripe/callback?code=stripe_auth_code&state=${staleState}`)
    );

    expect(res.headers.get("location")).toContain("stripe=error");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("a genuinely valid state (as minted by /connect) updates exactly the right tenant's stripe_account_id", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);
    mockedExchangeConnectCode.mockResolvedValue({ stripe_user_id: "acct_real_connected_account" });

    const validState = encodeState({
      tenantId: "real-tenant-id",
      userId: "real-owner",
      returnTo: "https://admin.scalardigital.co.uk/settings",
    });

    const res = await GET(
      new Request(`https://admin.scalardigital.co.uk/api/stripe/callback?code=real_stripe_code&state=${validState}`)
    );

    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/settings?stripe=connected");
    expect(admin.from).toHaveBeenCalledWith("tenants");
    expect(admin.update).toHaveBeenCalledWith({ stripe_account_id: "acct_real_connected_account" });
    expect(admin.eq).toHaveBeenCalledWith("id", "real-tenant-id");
  });
});

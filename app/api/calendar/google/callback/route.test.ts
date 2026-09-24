import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { encodeState } from "@/lib/googleCalendar";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/googleCalendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/googleCalendar")>("@/lib/googleCalendar");
  return { ...actual, exchangeCodeForTokens: vi.fn() };
});
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/googleCalendar";

const mockedCreateAdminClient = vi.mocked(createAdminClient);
const mockedExchangeCodeForTokens = vi.mocked(exchangeCodeForTokens);

function fakeAdminClient() {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  return { client: { from } as never, from, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

describe("GET /api/calendar/google/callback", () => {
  it("redirects with an error and touches nothing when code/state are missing", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/calendar/google/callback"));

    expect(res.headers.get("location")).toContain("calendar=error");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("SECURITY: a forged state is rejected and never reaches the database upsert", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);

    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: "victim-user-id", returnTo: "https://evil.example", iat: Date.now() })
    ).toString("base64url");
    const forgedState = `${forgedPayload}.not-a-real-signature`;

    const res = await GET(
      new Request(`https://admin.scalardigital.co.uk/api/calendar/google/callback?code=google_auth_code&state=${forgedState}`)
    );

    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/login?calendar=error");
    expect(admin.from).not.toHaveBeenCalled();
    expect(mockedExchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("a genuinely valid state links the tokens to exactly the right user id", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);
    mockedExchangeCodeForTokens.mockResolvedValue({
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_in: 3600,
    });

    const validState = encodeState({ userId: "real-user-id", returnTo: "https://admin.scalardigital.co.uk/dashboard" });

    const res = await GET(
      new Request(`https://admin.scalardigital.co.uk/api/calendar/google/callback?code=real_google_code&state=${validState}`)
    );

    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/dashboard?calendar=connected");
    expect(admin.from).toHaveBeenCalledWith("calendar_connections");
    expect(admin.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "real-user-id" }), { onConflict: "user_id" });
  });

  it("redirects with an error (not a throw) when Google doesn't return a refresh_token", async () => {
    const admin = fakeAdminClient();
    mockedCreateAdminClient.mockReturnValue(admin.client);
    mockedExchangeCodeForTokens.mockResolvedValue({ access_token: "fake-access-token", expires_in: 3600 } as never);

    const validState = encodeState({ userId: "real-user-id", returnTo: "https://admin.scalardigital.co.uk/dashboard" });

    const res = await GET(
      new Request(`https://admin.scalardigital.co.uk/api/calendar/google/callback?code=real_google_code&state=${validState}`)
    );

    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/dashboard?calendar=error");
    expect(admin.from).not.toHaveBeenCalled();
  });
});

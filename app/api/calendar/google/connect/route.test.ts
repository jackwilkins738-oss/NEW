import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { decodeState } from "@/lib/googleCalendar";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createClient);

function fakeSupabase(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
});

describe("GET /api/calendar/google/connect", () => {
  it("redirects to /login when no session exists", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase(null));

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/calendar/google/connect"));

    expect(res.headers.get("location")).toBe("https://admin.scalardigital.co.uk/login");
  });

  it("mints a state for a signed-in user that decodes back to exactly that user id", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ id: "real-user-id" }));

    const res = await GET(new Request("https://admin.scalardigital.co.uk/api/calendar/google/connect"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    const state = location.searchParams.get("state")!;

    const decoded = decodeState(state);
    expect(decoded).toEqual({
      userId: "real-user-id",
      returnTo: "https://admin.scalardigital.co.uk/dashboard",
    });
  });
});

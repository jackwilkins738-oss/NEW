import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
import { POST } from "./route";

const SECRET = "s".repeat(40);
const SLUG = "kerr-roofing-4a7bc2";
const call = (slug = SLUG, auth = `Bearer ${SECRET}`) =>
  POST(new Request(`https://admin.scalardigital.co.uk/api/prospects/${slug}/optout`, { method: "POST", headers: { authorization: auth } }), {
    params: Promise.resolve({ slug }),
  });

beforeEach(() => {
  process.env.PROSPECTS_API_SECRET = SECRET;
});

describe("POST /api/prospects/[slug]/optout", () => {
  it("marks the prospect lost, once", async () => {
    db = createFakeSupabase({ prospects: [{ id: "p1", slug: SLUG, business_name: "Kerr Roofing", status: "viewed" }] });
    const res = await call();
    expect(await res.json()).toEqual({ ok: true, business_name: "Kerr Roofing", changed: true });
    expect(db.table("prospects")[0].status).toBe("lost");
    expect((await (await call()).json()).changed).toBe(false);
  });

  it("never downgrades a win", async () => {
    db = createFakeSupabase({ prospects: [{ id: "p1", slug: SLUG, business_name: "Kerr Roofing", status: "won" }] });
    await call();
    expect(db.table("prospects")[0].status).toBe("won");
  });

  it("refuses without the secret, and for unknown slugs", async () => {
    db = createFakeSupabase({ prospects: [{ id: "p1", slug: SLUG, business_name: "Kerr Roofing", status: "new" }] });
    expect((await call(SLUG, "Bearer nope")).status).toBe(401);
    expect((await call("nobody-123456")).status).toBe(404);
    expect(db.table("prospects")[0].status).toBe("new");
  });
});

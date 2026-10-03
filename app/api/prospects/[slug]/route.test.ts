import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
import { DELETE } from "./route";

const SECRET = "s".repeat(40);
const SLUG = "kerr-roofing-4a7bc2";
const call = (slug = SLUG, auth = `Bearer ${SECRET}`) =>
  DELETE(new Request(`https://admin.scalardigital.co.uk/api/prospects/${slug}`, { method: "DELETE", headers: { authorization: auth } }), {
    params: Promise.resolve({ slug }),
  });

beforeEach(() => {
  process.env.PROSPECTS_API_SECRET = SECRET;
});

describe("DELETE /api/prospects/[slug]", () => {
  it("erases the preview record and counts quotes left in place", async () => {
    db = createFakeSupabase({
      prospects: [{ id: "p1", slug: SLUG, status: "viewed" }, { id: "p2", slug: "other-111111", status: "new" }],
      onboarding: [{ id: "o1", prospect_slug: SLUG }],
    });
    expect(await (await call()).json()).toEqual({ ok: true, deleted: true, quotes: 1 });
    expect(db.table("prospects").map((r) => r.id)).toEqual(["p2"]);
  });

  it("is fine when there's nothing to erase", async () => {
    db = createFakeSupabase({ prospects: [] });
    expect(await (await call()).json()).toEqual({ ok: true, deleted: false });
  });

  it("keeps a client's record", async () => {
    db = createFakeSupabase({ prospects: [{ id: "p1", slug: SLUG, status: "won" }] });
    expect((await call()).status).toBe(409);
    expect(db.table("prospects")).toHaveLength(1);
  });

  it("refuses without the secret", async () => {
    db = createFakeSupabase({ prospects: [{ id: "p1", slug: SLUG, status: "new" }] });
    expect((await call(SLUG, "Bearer nope")).status).toBe(401);
    expect(db.table("prospects")).toHaveLength(1);
  });
});

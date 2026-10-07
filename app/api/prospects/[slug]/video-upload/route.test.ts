import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/testing/fakeSupabase";

let db: FakeDb;
const signed: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    ...db.client,
    from: db.client.from.bind(db.client),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) => (signed.push(`${bucket}/${path}`), { data: { signedUrl: `https://x.supabase.co/sign/${path}?token=t` }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  }),
}));
import { POST } from "./route";

const SECRET = "s".repeat(40);
const SLUG = "kerr-roofing-4a7bc2";
const call = (slug = SLUG, auth = `Bearer ${SECRET}`) =>
  POST(new Request(`https://admin.scalardigital.co.uk/api/prospects/${slug}/video-upload`, { method: "POST", headers: { authorization: auth } }), {
    params: Promise.resolve({ slug }),
  });

beforeEach(() => {
  process.env.PROSPECTS_API_SECRET = SECRET;
  signed.length = 0;
  db = createFakeSupabase({ prospects: [{ id: "p1", slug: SLUG }] });
});

describe("POST /api/prospects/[slug]/video-upload", () => {
  it("hands out a one-time upload URL and where the video will live", async () => {
    const json = await (await call()).json();
    expect(json.upload_url).toMatch(/^https:\/\/x\.supabase\.co\/sign\/kerr-roofing-4a7bc2-[0-9a-f]{8}\.mp4\?token=t$/);
    expect(json.video_url).toMatch(/\/storage\/v1\/object\/public\/preview-videos\/kerr-roofing-4a7bc2-[0-9a-f]{8}\.mp4$/);
    expect(signed[0]).toMatch(/^preview-videos\//);
  });

  it("refuses strangers and unknown pages", async () => {
    expect((await call(SLUG, "Bearer nope")).status).toBe(401);
    expect((await call("nobody-111111")).status).toBe(404);
  });
});

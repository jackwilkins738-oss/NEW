import { describe, expect, it } from "vitest";
import { GET } from "./route";

// track.js is JavaScript written inside a template string, so a lost escape
// breaks it on every customer's website with no type error to catch it. Run
// the real served script against a fake page.
async function load() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  const src = await (await GET()).text();
  const posts: Record<string, unknown>[] = [];
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const document = {
    currentScript: {
      getAttribute: (k: string) => ({ "data-tenant": "t1", "data-site-key": "k1" })[k] ?? null,
      src: "https://admin.example.com/track.js",
    },
    referrer: "",
    addEventListener: (ev: string, fn: (e: unknown) => void) => (listeners[ev] ??= []).push(fn),
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const fetch = (_url: string, opts: { body: string }) => {
    posts.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };
  new Function("document", "fetch", "location", "console", src)(document, fetch, { pathname: "/contact.html", href: "" }, console);
  const tap = (href: string) =>
    (listeners.click ?? []).forEach((fn) => fn({ target: { closest: () => ({ getAttribute: () => href }) } }));
  return { posts, tap };
}

describe("track.js", () => {
  it("logs the page view, then a tap on call, WhatsApp and email links - nothing for other links", async () => {
    const { posts, tap } = await load();
    ["tel:+441234567890", "https://wa.me/447000000000", "mailto:a@b.co", "/services.html", "https://example.com"].forEach(tap);
    expect(posts.map((p) => p.kind ?? "pageview")).toEqual(["pageview", "call", "whatsapp", "email"]);
    expect(posts[1]).toMatchObject({ tenant_id: "t1", site_key: "k1", path: "/contact.html" });
  });
});

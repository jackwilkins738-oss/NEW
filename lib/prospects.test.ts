import { describe, expect, it } from "vitest";
import { TEARDOWN_MAX_CHARS, isValidProspectSlug, normaliseProspect, normaliseTeardown, slimTeardown, videoEmbedUrl } from "./prospects";

describe("isValidProspectSlug", () => {
  it("accepts lowercase hyphenated slugs", () => {
    expect(isValidProspectSlug("smith-roofing-3f9a2")).toBe(true);
  });
  it("rejects anything that could escape a URL path or query", () => {
    for (const bad of ["Smith-Roofing", "a/b", "a..b", "-lead", "trail-", "a--b", "a b", "", "x".repeat(81)]) {
      expect(isValidProspectSlug(bad)).toBe(false);
    }
  });
});

describe("normaliseProspect", () => {
  const base = { slug: "smith-roofing-3f9a2", business_name: "Smith Roofing" };

  it("keeps public business facts only", () => {
    const res = normaliseProspect({
      ...base,
      trade: "Roofing",
      area: "Guildford",
      website: "https://www.smithroofing.co.uk/contact?x=1",
      mobile_score: "43",
      lcp_s: 6.84,
      channel: "letter",
      email: "dave@smithroofing.co.uk",
      phone: "07700 900000",
    });
    expect(res).toEqual({
      row: {
        slug: "smith-roofing-3f9a2",
        business_name: "Smith Roofing",
        trade: "Roofing",
        area: "Guildford",
        website: "smithroofing.co.uk",
        mobile_score: 43,
        lcp_s: 6.8,
        channel: "letter",
      },
    });
  });

  it("drops out-of-range numbers rather than storing them", () => {
    const res = normaliseProspect({ ...base, mobile_score: 140, lcp_s: -2 });
    expect("row" in res && res.row.mobile_score).toBe(null);
    expect("row" in res && res.row.lcp_s).toBe(null);
  });

  it("defaults an unknown channel to email", () => {
    const res = normaliseProspect({ ...base, channel: "carrier pigeon" });
    expect("row" in res && res.row.channel).toBe("email");
  });

  it("rejects a row without a business name or with a bad slug", () => {
    expect(normaliseProspect({ slug: "ok-slug", business_name: "   " })).toEqual({ error: "missing business_name" });
    expect(normaliseProspect({ slug: "Bad Slug", business_name: "X" })).toEqual({ error: "invalid slug" });
    expect(normaliseProspect(null)).toEqual({ error: "not an object" });
  });

  it("rejects a website that isn't a real host", () => {
    const res = normaliseProspect({ ...base, website: "not a site" });
    expect("row" in res && res.row.website).toBe(null);
  });
});

describe("normaliseTeardown", () => {
  it("keeps known checks and in-range numbers, drops everything else", () => {
    expect(
      normaliseTeardown({
        checks: { tapToCall: false, https: true, madeUp: false, whatsapp: "no" },
        seoScore: 78.4,
        imageSavingsKb: 1400,
        copyrightYear: 2019,
        platform: "wordpress",
        wpPluginCount: 23,
        notes: "<script>",
        accessibilityScore: 140,
      })
    ).toEqual({
      v: 1,
      checks: { tapToCall: false, https: true },
      seoScore: 78,
      imageSavingsKb: 1400,
      copyrightYear: 2019,
      platform: "wordpress",
      wpPluginCount: 23,
    });
  });

  it("accepts the insecure-files check", () => {
    expect(normaliseTeardown({ checks: { secureAssets: false } })).toEqual({ v: 1, checks: { secureAssets: false } });
  });

  it("keeps 2-3 plain service names and a #rrggbb brand colour, nothing else", () => {
    expect(
      normaliseTeardown({
        checks: { https: true },
        services: ["Flat Roofs", "  Roof   Repairs ", "<b>x</b>", 7, "Chimney & Leadwork", "Guttering"],
        brandColour: "#B3261E",
      }),
    ).toEqual({
      v: 1,
      checks: { https: true },
      services: ["Flat Roofs", "Roof Repairs", "Chimney & Leadwork"],
      brandColour: "#b3261e",
    });
    expect(normaliseTeardown({ checks: { https: true }, services: ["Only one"], brandColour: "red" })).toEqual({
      v: 1,
      checks: { https: true },
    });
    expect(normaliseTeardown({ checks: { https: true }, brandColour: "url(javascript:x)" })).toEqual({
      v: 1,
      checks: { https: true },
    });
  });

  it("rejects an unknown platform and an empty teardown", () => {
    expect(normaliseTeardown({ checks: {}, platform: "myspace" })).toBe(null);
    expect(normaliseTeardown("nope")).toBe(null);
  });
});

describe("normaliseProspect with a teardown", () => {
  const base = { slug: "smith-roofing-3f9a2", business_name: "Smith Roofing" };

  it("attaches it only with a valid check date", () => {
    const withDate = normaliseProspect({ ...base, teardown: { checks: { tapToCall: false } }, teardown_at: "2026-09-26T09:00:00Z" });
    expect("row" in withDate && withDate.row.teardown?.checks.tapToCall).toBe(false);
    expect("row" in withDate && withDate.row.teardown_at).toBe("2026-09-26T09:00:00.000Z");

    const noDate = normaliseProspect({ ...base, teardown: { checks: { tapToCall: false } } });
    expect("row" in noDate && "teardown" in noDate.row).toBe(false);
  });
});

describe("normaliseTeardown - logo and photos", () => {
  it("keeps https raster images only, at most four photos, no duplicates", () => {
    const t = normaliseTeardown({
      checks: { https: true },
      logo: "https://kerr.co.uk/img/logo.png",
      photos: [
        "https://kerr.co.uk/img/roof-1.jpg",
        "https://kerr.co.uk/img/roof-1.jpg",
        "http://kerr.co.uk/img/roof-2.jpg",
        "https://kerr.co.uk/img/badge.svg",
        "javascript:alert(1).jpg",
        "https://kerr.co.uk/img/roof-3.webp?w=800",
        "https://kerr.co.uk/a.png",
        "https://kerr.co.uk/b.jpeg",
        "https://kerr.co.uk/c.jpg",
      ],
    })!;
    expect(t.logo).toBe("https://kerr.co.uk/img/logo.png");
    expect(t.photos).toEqual([
      "https://kerr.co.uk/img/roof-1.jpg",
      "https://kerr.co.uk/img/roof-3.webp?w=800",
      "https://kerr.co.uk/a.png",
      "https://kerr.co.uk/b.jpeg",
    ]);
  });

  it("drops an SVG logo or one with quotes in it", () => {
    expect(normaliseTeardown({ checks: { https: true }, logo: "https://kerr.co.uk/logo.svg" })!.logo).toBeUndefined();
    expect(normaliseTeardown({ checks: { https: true }, logo: 'https://kerr.co.uk/"><x.png' })!.logo).toBeUndefined();
  });
});

describe("normaliseTeardown - filmstrip and screenshot", () => {
  const jpeg = (n = 40) => `data:image/jpeg;base64,${"A".repeat(n)}==`;
  const frames = [
    { t: 1125, img: jpeg() },
    { t: 1875, img: jpeg() },
    { t: 3000, img: jpeg() },
  ];

  it("keeps three ordered small JPEG frames and a screenshot", () => {
    const out = normaliseTeardown({ checks: { https: true }, frames, screenshot: jpeg(1000) })!;
    expect(out.frames).toEqual(frames);
    expect(out.screenshot).toBe(jpeg(1000));
  });

  it("drops frames that aren't exactly three, out of order, oversized or not JPEG", () => {
    const base = { checks: { https: true } };
    expect(normaliseTeardown({ ...base, frames: frames.slice(0, 2) })!.frames).toBeUndefined();
    expect(normaliseTeardown({ ...base, frames: [frames[2], frames[0], frames[1]] })!.frames).toBeUndefined();
    expect(normaliseTeardown({ ...base, frames: [...frames.slice(0, 2), { t: 3000, img: jpeg(13_000) }] })!.frames).toBeUndefined();
    expect(
      normaliseTeardown({ ...base, frames: [...frames.slice(0, 2), { t: 3000, img: "data:image/svg+xml;base64,AAAA" }] })!.frames,
    ).toBeUndefined();
    expect(normaliseTeardown({ ...base, frames: [...frames.slice(0, 2), { t: 90_000, img: jpeg() }] })!.frames).toBeUndefined();
  });

  it("drops a screenshot that is too big or carries anything but base64", () => {
    const base = { checks: { https: true } };
    expect(normaliseTeardown({ ...base, screenshot: jpeg(41_000) })!.screenshot).toBeUndefined();
    expect(normaliseTeardown({ ...base, screenshot: 'data:image/jpeg;base64,AA"><script>' })!.screenshot).toBeUndefined();
  });
});

describe("normaliseTeardown - Google rating and rivals", () => {
  it("keeps a real rating, rounded, and drops a made-up one", () => {
    expect(normaliseTeardown({ checks: { showsReviews: false }, google: { rating: 4.83, reviews: 63 } })).toMatchObject({
      checks: { showsReviews: false },
      google: { rating: 4.8, reviews: 63 },
    });
    expect(normaliseTeardown({ checks: { https: true }, google: { rating: 7, reviews: 63 } })!.google).toBeUndefined();
    expect(normaliseTeardown({ checks: { https: true }, google: { rating: 4.5, reviews: 0 } })!.google).toBeUndefined();
  });

  it("keeps two or three plain rivals with scores, and nothing that could carry markup", () => {
    const out = normaliseTeardown({
      checks: { https: true },
      rivals: {
        query: "roofer in Guildford",
        position: 7,
        checkedAt: "2026-10-05",
        items: [
          { name: "Top Roofing", score: 88 },
          { name: "<script>x</script>", score: 70 },
          { name: "Second Roofing", score: 140 },
          { name: "Smith & Sons (Roofing) Ltd.", score: 64 },
          { name: "Fourth", score: 50 },
        ],
      },
    })!;
    expect(out.rivals).toEqual({
      query: "roofer in Guildford",
      position: 7,
      checkedAt: "2026-10-05",
      items: [
        { name: "Top Roofing", score: 88 },
        { name: "Smith & Sons (Roofing) Ltd.", score: 64 },
        { name: "Fourth", score: 50 },
      ],
    });
  });

  it("drops a comparison with fewer than two rivals or a bad search", () => {
    const one = { query: "roofer in Guildford", items: [{ name: "Top", score: 80 }] };
    expect(normaliseTeardown({ checks: { https: true }, rivals: one })!.rivals).toBeUndefined();
    const bad = { query: "<b>x</b>", items: [{ name: "A1", score: 80 }, { name: "B1", score: 70 }] };
    expect(normaliseTeardown({ checks: { https: true }, rivals: bad })!.rivals).toBeUndefined();
  });
});

describe("normaliseTeardown - size", () => {
  const jpeg = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}==`;
  it("drops the biggest pictures first to stay under the limit", () => {
    const out = normaliseTeardown({
      checks: { tapToCall: false },
      frames: [0, 1, 2].map((i) => ({ t: i * 1000, img: jpeg(11_000) })),
      screenshot: jpeg(39_000),
      photos: ["https://kerr.co.uk/a.jpg"],
    })!;
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(TEARDOWN_MAX_CHARS);
    expect(out.frames).toHaveLength(3); // ~73 KB in all - under 100 KB, so nothing needed dropping
    expect(slimTeardown(out)).toEqual({ v: 1, checks: { tapToCall: false } });
  });
});

describe("videoEmbedUrl", () => {
  it("turns Loom, YouTube and Vimeo links into their players", () => {
    const loom = "0123456789abcdef0123456789abcdef";
    expect(videoEmbedUrl(`https://www.loom.com/share/${loom}`)).toBe(`https://www.loom.com/embed/${loom}`);
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });

  it("takes the panel's own uploaded walkthroughs, from this project only", () => {
    const own = "https://abcdefghijklmnopqrst.supabase.co";
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = own;
    try {
      const file = `${own}/storage/v1/object/public/preview-videos/kerr-roofing-4a7bc2-0a1b2c3d.mp4`;
      expect(videoEmbedUrl(file)).toBe(file);
      expect(videoEmbedUrl(file.replace("abcdefghijklmnopqrst", "zzzzzzzzzzzzzzzzzzzz"))).toBeNull();
      expect(videoEmbedUrl(`${own}/storage/v1/object/public/lead-photos/x.mp4`)).toBeNull();
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });

  it("refuses anything else", () => {
    for (const bad of ["http://youtu.be/dQw4w9WgXcQ", "https://loom.com.evil.io/share/0123456789abcdef0123456789abcdef",
      "https://www.loom.com/share/nope", "javascript:alert(1)", "", 42, null]) {
      expect(videoEmbedUrl(bad)).toBeNull();
    }
  });
});

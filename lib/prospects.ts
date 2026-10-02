// Validation for rows arriving at /api/prospects/import. Pure, so the rules
// live in one tested place rather than inline in the route.
//
// Only public business facts are accepted - the name a firm trades under,
// its trade, town, website and Google's score for it. No email, phone or
// personal name fields exist here at all: those stay in the outreach sheet
// on the owner's own machine, never in a table that backs a public page.

export const PROSPECT_CHANNELS = ["email", "letter", "phone"] as const;
export const PROSPECT_STATUSES = ["new", "contacted", "viewed", "replied", "won", "lost"] as const;
export const MAX_IMPORT_ROWS = 500;

export type ProspectChannel = (typeof PROSPECT_CHANNELS)[number];
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export type ProspectRow = {
  slug: string;
  business_name: string;
  trade: string | null;
  area: string | null;
  website: string | null;
  mobile_score: number | null;
  lcp_s: number | null;
  channel: ProspectChannel;
  /** Only present when the import carried a teardown (migration 042). */
  teardown?: Teardown;
  teardown_at?: string;
};

// ---------------------------------------------------------------------
// Website teardown (migration 042). Check results only: true = fine,
// false = a problem, absent = couldn't be checked. Anything not on these
// lists is dropped, so the column can only ever hold what the preview page
// knows how to word.
// ---------------------------------------------------------------------

export const TEARDOWN_CHECKS = [
  "tapToCall",
  "whatsapp",
  "contactForm",
  "localSchema",
  "readableText",
  "tapTargets",
  "pageTitle",
  "metaDescription",
  "https",
  "secureAssets",
] as const;
export const TEARDOWN_PLATFORMS = ["wordpress", "wix", "squarespace", "godaddy", "webflow", "weebly", "duda", "shopify"] as const;

export type Teardown = {
  v: 1;
  checks: Partial<Record<(typeof TEARDOWN_CHECKS)[number], boolean>>;
  seoScore?: number;
  accessibilityScore?: number;
  imageSavingsKb?: number;
  pageWeightKb?: number;
  copyrightYear?: number;
  platform?: (typeof TEARDOWN_PLATFORMS)[number];
  wpPluginCount?: number;
  /** 2-3 service names from their own homepage, shown in the preview's concept. */
  services?: string[];
  /** Their brand colour (#rrggbb), already darkened to take white text. */
  brandColour?: string;
  /** Their logo and up to 4 photos from their own homepage (https images only, no SVG) - for
   *  "your homepage, rebuilt" on the preview, fetched through the website's own image route. */
  logo?: string;
  photos?: string[];
  /** Slow sites only: 3 small frames of their homepage loading on Google's test phone (ms since
   *  the start, JPEG data URI), and how it looks once loaded. Removed after SHOTS_KEEP_DAYS. */
  frames?: { t: number; img: string }[];
  screenshot?: string;
};

// Small inline JPEGs only - nothing that could carry markup, nothing that bloats the row.
const JPEG_URI_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const FRAME_MAX = 12_000;
const SCREENSHOT_MAX = 40_000;
export const SHOTS_KEEP_DAYS = 45;

function jpegUri(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max && JPEG_URI_RE.test(value) ? value : undefined;
}

// A service name reaches a public page, so only short, plain wording gets
// through: letters, digits, spaces and a little punctuation - no markup.
const SERVICE_RE = /^[A-Za-z0-9 &'/,+-]{2,24}$/;
const COLOUR_RE = /^#[0-9a-f]{6}$/;
// Raster images on https only: an SVG can carry script, and plain http would be blocked on the page.
const IMAGE_URL_RE = /^https:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp)(?:\?[^\s"'<>]*)?$/i;

function imageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 400 || !IMAGE_URL_RE.test(value)) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function intIn(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.round(value);
  return n >= min && n <= max ? n : undefined;
}

export function normaliseTeardown(input: unknown): Teardown | null {
  if (!input || typeof input !== "object") return null;
  const t = input as Record<string, unknown>;
  const rawChecks = t.checks && typeof t.checks === "object" ? (t.checks as Record<string, unknown>) : {};
  const checks: Teardown["checks"] = {};
  for (const key of TEARDOWN_CHECKS) {
    if (typeof rawChecks[key] === "boolean") checks[key] = rawChecks[key] as boolean;
  }
  const out: Teardown = { v: 1, checks };
  const put = <K extends keyof Teardown>(k: K, v: Teardown[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  put("seoScore", intIn(t.seoScore, 0, 100));
  put("accessibilityScore", intIn(t.accessibilityScore, 0, 100));
  put("imageSavingsKb", intIn(t.imageSavingsKb, 0, 1_000_000));
  put("pageWeightKb", intIn(t.pageWeightKb, 0, 1_000_000));
  put("copyrightYear", intIn(t.copyrightYear, 1995, 2100));
  put("wpPluginCount", intIn(t.wpPluginCount, 0, 500));
  if (TEARDOWN_PLATFORMS.includes(t.platform as Teardown["platform"] & string)) {
    out.platform = t.platform as Teardown["platform"];
  }
  if (Array.isArray(t.services)) {
    const services = t.services
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.replace(/\s+/g, " ").trim())
      .filter((x) => SERVICE_RE.test(x))
      .slice(0, 3);
    if (services.length >= 2) out.services = services;
  }
  if (typeof t.brandColour === "string" && COLOUR_RE.test(t.brandColour.toLowerCase())) {
    out.brandColour = t.brandColour.toLowerCase();
  }
  put("logo", imageUrl(t.logo));
  if (Array.isArray(t.photos)) {
    const photos = [...new Set(t.photos.map(imageUrl).filter((u): u is string => !!u))].slice(0, 4);
    if (photos.length) out.photos = photos;
  }
  if (Array.isArray(t.frames) && t.frames.length === 3) {
    const frames = t.frames.flatMap((f) => {
      const r = f && typeof f === "object" ? (f as Record<string, unknown>) : {};
      const ms = intIn(r.t, 0, 60_000);
      const img = jpegUri(r.img, FRAME_MAX);
      return ms !== undefined && img ? [{ t: ms, img }] : [];
    });
    if (frames.length === 3 && frames.every((f, i) => i === 0 || f.t >= frames[i - 1].t)) out.frames = frames;
  }
  put("screenshot", jpegUri(t.screenshot, SCREENSHOT_MAX));
  const hasAnything = Object.keys(checks).length > 0 || Object.keys(out).length > 2;
  return hasAnything ? out : null;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

export function isValidProspectSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= 80 && SLUG_RE.test(slug);
}

/** Bare host only - no scheme, path or query - so nothing but a domain reaches the page. */
function website(value: unknown): string | null {
  const raw = text(value, 200);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname.includes(".")) return null;
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function score(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= 100 ? r : null;
}

function seconds(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n >= 1000) return null;
  return Math.round(n * 10) / 10;
}

/** Returns the cleaned row, or a reason it was rejected. */
export function normaliseProspect(input: unknown): { row: ProspectRow } | { error: string } {
  if (!input || typeof input !== "object") return { error: "not an object" };
  const r = input as Record<string, unknown>;
  if (!isValidProspectSlug(r.slug)) return { error: "invalid slug" };
  const business_name = text(r.business_name, 120);
  if (!business_name) return { error: "missing business_name" };
  const channel = PROSPECT_CHANNELS.includes(r.channel as ProspectChannel) ? (r.channel as ProspectChannel) : "email";
  const row: ProspectRow = {
    slug: r.slug,
    business_name,
    trade: text(r.trade, 60),
    area: text(r.area, 80),
    website: website(r.website),
    mobile_score: score(r.mobile_score),
    lcp_s: seconds(r.lcp_s),
    channel,
  };
  const teardown = normaliseTeardown(r.teardown);
  const checkedAt = typeof r.teardown_at === "string" ? new Date(r.teardown_at) : null;
  if (teardown && checkedAt && !Number.isNaN(checkedAt.getTime())) {
    row.teardown = teardown;
    row.teardown_at = checkedAt.toISOString();
  }
  return { row };
}

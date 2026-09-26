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
};

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
  return {
    row: {
      slug: r.slug,
      business_name,
      trade: text(r.trade, 60),
      area: text(r.area, 80),
      website: website(r.website),
      mobile_score: score(r.mobile_score),
      lcp_s: seconds(r.lcp_s),
      channel,
    },
  };
}

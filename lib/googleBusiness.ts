// Google Business Profile, for Growth clients: Scalar's one Google account
// (connected once from /admin) is a manager on each client's profile, so it
// can post their approved job posts and their approved review replies, and
// read their reviews. Needs Scalar's Business Profile API access (approved
// per Google Cloud project): GBP_CLIENT_ID / GBP_CLIENT_SECRET are an OAuth
// client in that project (falling back to the calendar's GOOGLE_CLIENT_ID /
// SECRET when it's the same project). Plain fetch, like lib/googleCalendar.ts.
import { createAdminClient } from "@/lib/supabase/admin";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";
export const SCOPE = "https://www.googleapis.com/auth/business.manage";

export class GoogleBusinessError extends Error {}

const clientId = () => process.env.GBP_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.GBP_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
export const redirectUri = () => "https://admin.scalardigital.co.uk/api/google-business/callback";
export const googleBusinessConfigured = () => !!(clientId() && clientSecret());

export function buildAuthUrl(state: string): string {
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: `${SCOPE} openid email`,
    state,
  })}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };

async function token(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
  });
  if (!res.ok) throw new GoogleBusinessError(`Google token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Tokens;
}

export const exchangeCode = (code: string) => token({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });

/** The signed-in Google account's email, from the id_token Google just sent us over TLS (not verified further). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** A fresh access token for Scalar's connection, or null when it isn't connected. */
export async function accessToken(): Promise<string | null> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("google_business_connection").select("*").eq("id", "scalar").maybeSingle();
  if (!c) return null;
  if (Date.parse(c.token_expires_at) - Date.now() > 60_000) return c.access_token;
  const t = await token({ refresh_token: c.refresh_token, grant_type: "refresh_token" });
  await admin
    .from("google_business_connection")
    .update({ access_token: t.access_token, token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() })
    .eq("id", "scalar");
  return t.access_token;
}

async function api<T>(tokenValue: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${tokenValue}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new GoogleBusinessError(`Google said ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export type Location = { name: string; title: string; address: string };

/** Every profile Scalar's account manages - for linking a client in /admin. */
export async function listLocations(tokenValue: string): Promise<Location[]> {
  const { accounts = [] } = await api<{ accounts?: { name: string }[] }>(tokenValue, `${ACCOUNTS_API}/accounts`);
  const out: Location[] = [];
  for (const account of accounts) {
    const { locations = [] } = await api<{ locations?: { name: string; title?: string; storefrontAddress?: { locality?: string; postalCode?: string } }[] }>(
      tokenValue,
      `${INFO_API}/${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`
    );
    for (const l of locations) {
      out.push({
        name: `${account.name}/${l.name}`,
        title: l.title ?? l.name,
        address: [l.storefrontAddress?.locality, l.storefrontAddress?.postalCode].filter(Boolean).join(" "),
      });
    }
  }
  return out;
}

export const LOCATION = /^accounts\/\d+\/locations\/\d+$/;

/** A job post as a Google "update": the text, the first photo, and a link to its page. */
export function localPostBody(post: { google_post: string; title: string; page_url: string | null; photos: { url: string }[] }) {
  const body: Record<string, unknown> = {
    languageCode: "en-GB",
    topicType: "STANDARD",
    summary: (post.google_post || post.title).slice(0, 1500),
  };
  if (post.page_url) body.callToAction = { actionType: "LEARN_MORE", url: post.page_url };
  if (post.photos[0]?.url) body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.photos[0].url }];
  return body;
}

export async function createLocalPost(tokenValue: string, location: string, body: Record<string, unknown>): Promise<string> {
  const res = await api<{ name: string }>(tokenValue, `${V4}/${location}/localPosts`, { method: "POST", body: JSON.stringify(body) });
  return res.name;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export type GoogleReview = { review_name: string; reviewer: string | null; star_rating: number | null; comment: string | null; reviewed_at: string | null; reply: string | null; replied_at: string | null };

type RawReview = {
  name: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

export function mapReview(r: RawReview): GoogleReview {
  return {
    review_name: r.name,
    reviewer: r.reviewer?.isAnonymous ? null : r.reviewer?.displayName ?? null,
    star_rating: STARS[r.starRating ?? ""] ?? null,
    // Google appends "(Translated by Google)" blocks to some - the reviewer's own words come first.
    comment: r.comment ? r.comment.split("\n\n(Translated by Google)")[0].slice(0, 4000) : null,
    reviewed_at: r.createTime ?? null,
    reply: r.reviewReply?.comment ?? null,
    replied_at: r.reviewReply?.updateTime ?? null,
  };
}

export async function listReviews(tokenValue: string, location: string): Promise<GoogleReview[]> {
  const res = await api<{ reviews?: RawReview[] }>(tokenValue, `${V4}/${location}/reviews?pageSize=50&orderBy=updateTime%20desc`);
  return (res.reviews ?? []).map(mapReview);
}

export async function replyToReview(tokenValue: string, reviewName: string, comment: string): Promise<void> {
  await api(tokenValue, `${V4}/${reviewName}/reply`, { method: "PUT", body: JSON.stringify({ comment: comment.slice(0, 4000) }) });
}

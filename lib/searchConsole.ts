import { createSign } from "node:crypto";

// Google Search Console, read-only: how often a client's site showed up in
// Google and how often people clicked - the number that proves the website is
// being found, for the monthly report. One Google service account (its JSON
// key in GSC_SERVICE_ACCOUNT_JSON) is added as a Restricted user on each
// client's Search Console property; nothing per client is stored here - the
// property is worked out from their domain. Anything missing or refused just
// means the report goes without its Google section.

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3/sites";

export type SearchStats = {
  clicks: number;
  impressions: number;
  /** Average position in Google's results, 1 = top. */
  position: number;
  topQueries: { query: string; clicks: number }[];
};

type ServiceAccount = { client_email: string; private_key: string };
type Fetch = typeof fetch;

export function serviceAccount(raw = process.env.GSC_SERVICE_ACCOUNT_JSON): ServiceAccount | null {
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    return sa.client_email && sa.private_key?.includes("PRIVATE KEY") ? { client_email: sa.client_email, private_key: sa.private_key } : null;
  } catch {
    return null;
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A signed service-account assertion (RS256), exchanged for an access token. */
export function assertion(sa: ServiceAccount, nowSeconds: number): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

export async function accessToken(sa: ServiceAccount, doFetch: Fetch = fetch, now = Date.now()): Promise<string | null> {
  const res = await doFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(sa, Math.floor(now / 1000)),
    }).toString(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/** The ways a client's property may be registered, most likely first. */
export function propertiesFor(domain: string): string[] {
  const bare = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return bare ? [`sc-domain:${bare}`, `https://www.${bare}/`, `https://${bare}/`] : [];
}

async function query(property: string, token: string, body: object, doFetch: Fetch) {
  const res = await doFetch(`${API}/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as { rows?: { keys?: string[]; clicks: number; impressions: number; position: number }[] };
}

/** Last month's search figures for a client, or null when there's no access or no property. from/to: YYYY-MM-DD, to exclusive. */
export async function searchStats(domain: string, from: string, to: string, doFetch: Fetch = fetch): Promise<SearchStats | null> {
  const sa = serviceAccount();
  if (!sa || !domain) return null;
  const token = await accessToken(sa, doFetch);
  if (!token) return null;
  const end = new Date(Date.parse(`${to}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10); // the API's end date is inclusive
  for (const property of propertiesFor(domain)) {
    const total = await query(property, token, { startDate: from, endDate: end }, doFetch);
    if (!total) continue; // not this form of the property, or not shared with us
    const row = total.rows?.[0];
    const top = await query(property, token, { startDate: from, endDate: end, dimensions: ["query"], rowLimit: 5 }, doFetch);
    return {
      clicks: Math.round(row?.clicks ?? 0),
      impressions: Math.round(row?.impressions ?? 0),
      position: Math.round((row?.position ?? 0) * 10) / 10,
      topQueries: (top?.rows ?? [])
        .filter((r) => r.keys?.[0] && r.clicks > 0)
        .slice(0, 3)
        .map((r) => ({ query: r.keys![0], clicks: Math.round(r.clicks) })),
    };
  }
  return null;
}

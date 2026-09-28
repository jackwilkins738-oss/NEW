// Adds a new customer's address to Supabase Auth's Redirect URLs, the one
// setup step that used to mean a trip to the Supabase dashboard for every
// customer (their invite and password-reset links fail without it - the
// *.scalardigital.co.uk wildcard doesn't cover it). Uses the Supabase
// Management API with a personal access token (SUPABASE_ACCESS_TOKEN). With
// no token it does nothing and /admin shows the URL to add by hand, exactly
// as before.

export function redirectUrlFor(tenant: { domain: string | null; slug: string }): string {
  return `https://${tenant.domain || `${tenant.slug}.scalardigital.co.uk`}/**`;
}

/** Supabase's allow list is one comma-separated string. Adds `url` once; null if already there. */
export function withRedirectUrl(allowList: string | null | undefined, url: string): string | null {
  const entries = (allowList ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.includes(url)) return null;
  return [...entries, url].join(",");
}

/** The project ref from https://<ref>.supabase.co. */
export function projectRef(supabaseUrl: string | undefined): string | null {
  const match = /^https:\/\/([a-z0-9]{10,40})\.supabase\.co\/?$/.exec(supabaseUrl ?? "");
  return match ? match[1] : null;
}

/** "added" / "present" when the URL is in the list, "manual" when it needs adding by hand. Never throws. */
export async function ensureRedirectUrl(url: string): Promise<"added" | "present" | "manual"> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!token || !ref) return "manual";
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const current = await fetch(endpoint, { headers, cache: "no-store" });
    if (!current.ok) throw new Error(`reading auth config: ${current.status}`);
    const { uri_allow_list } = (await current.json()) as { uri_allow_list?: string | null };
    const next = withRedirectUrl(uri_allow_list, url);
    if (next === null) return "present";
    const saved = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify({ uri_allow_list: next }) });
    if (!saved.ok) throw new Error(`saving auth config: ${saved.status}`);
    return "added";
  } catch (err) {
    console.error("Couldn't add the Supabase redirect URL:", err);
    return "manual";
  }
}

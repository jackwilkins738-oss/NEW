// Plain fetch against Stripe's REST API, same reasoning as googleCalendar.ts
// and lib/email.ts - no SDK for a surface this small.
//
// Stripe Connect (Standard), not a single shared Stripe account: each
// tenant connects their own Stripe account via OAuth (same shape as the
// Google Calendar connect flow), and every Checkout Session is created
// "on behalf of" that connected account (the Stripe-Account header below) -
// so a paid invoice pays out to that business's own bank account, not into
// one shared pot that would need manually splitting out per tenant.
import crypto from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";
const CONNECT_OAUTH_URL = "https://connect.stripe.com/oauth/authorize";
const CONNECT_TOKEN_URL = "https://connect.stripe.com/oauth/token";

function redirectUri() {
  return "https://admin.scalardigital.co.uk/api/stripe/callback";
}

// The state param round-trips through Stripe's own servers and back to a
// callback with no session of its own to check it against - so it has to
// carry its own proof that WE issued it, for THIS user, recently. Without
// that, anyone can build their own {tenantId, returnTo} blob, complete
// Stripe's OAuth consent with their own account, and hit the callback
// directly to re-point a victim tenant's payouts at themselves. Signed with
// SUPABASE_SERVICE_ROLE_KEY as HMAC key material (not for its DB
// privileges here, just as an existing server-only secret) rather than
// adding a new env var for this alone.
const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign OAuth state");
  return secret;
}

export function encodeState(data: { tenantId: string; userId: string; returnTo: string }) {
  const payload = Buffer.from(JSON.stringify({ ...data, iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function decodeState(state: string): { tenantId: string; userId: string; returnTo: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;

  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(sig);
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.iat !== "number" || Date.now() - data.iat > STATE_TTL_MS) return null;
    if (typeof data.tenantId !== "string" || typeof data.userId !== "string" || typeof data.returnTo !== "string") return null;
    return { tenantId: data.tenantId, userId: data.userId, returnTo: data.returnTo };
  } catch {
    return null;
  }
}

export function buildConnectUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.STRIPE_CLIENT_ID ?? "",
    state,
    scope: "read_write",
    redirect_uri: redirectUri(),
  });
  return `${CONNECT_OAUTH_URL}?${params.toString()}`;
}

export async function exchangeConnectCode(code: string): Promise<{ stripe_user_id: string }> {
  const res = await fetch(CONNECT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_secret: process.env.STRIPE_SECRET_KEY ?? "",
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Stripe Connect token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function createCheckoutSession(
  connectedAccountId: string,
  params: { amountPence: number; description: string; successUrl: string; cancelUrl: string; metadata: Record<string, string> }
): Promise<{ id: string; url: string }> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("line_items[0][price_data][currency]", "gbp");
  body.set("line_items[0][price_data][unit_amount]", String(params.amountPence));
  body.set("line_items[0][price_data][product_data][name]", params.description);
  body.set("line_items[0][quantity]", "1");
  for (const [key, value] of Object.entries(params.metadata)) {
    body.set(`metadata[${key}]`, value);
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Creates the session under the connected account, not the platform
      // account - this is what makes the payout go to the tenant's own bank.
      "Stripe-Account": connectedAccountId,
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe checkout session failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Manual signature check (Stripe's own documented algorithm) rather than
// the SDK's Webhook.constructEvent - `t=<timestamp>,v1=<hex hmac>` in the
// Stripe-Signature header, HMAC-SHA256 of "<timestamp>.<raw body>" against
// the webhook signing secret.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  if (!parts.t || !parts.v1) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  // Constant-time compare - a plain === would leak timing information about
  // how many leading characters matched.
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(parts.v1);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

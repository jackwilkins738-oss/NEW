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

export function encodeState(data: { tenantId: string; returnTo: string }) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeState(state: string): { tenantId: string; returnTo: string } | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
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

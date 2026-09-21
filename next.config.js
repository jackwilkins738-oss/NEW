/** @type {import('next').NextConfig} */

// Origins this app actually talks to. Kept as one list so the CSP below and
// anyone auditing it read from the same place rather than drifting apart.
const SUPABASE = "https://*.supabase.co";
const SENTRY = "https://*.ingest.sentry.io";
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";
const STRIPE = "https://api.stripe.com https://connect.stripe.com";
const GOOGLE_APIS = "https://www.googleapis.com https://oauth2.googleapis.com";

// Content-Security-Policy, shipped in Report-Only mode.
//
// Report-Only rather than enforcing, deliberately: a CSP that's wrong breaks
// the app silently in production, and this one has never been exercised
// against a real deploy. In this mode the browser logs every violation to the
// console but blocks nothing, so you can click through the app (especially
// quotes, invoices, the customer portal and /admin), collect the real
// violations, fold them in, and only then rename the header to
// `Content-Security-Policy` to start enforcing.
//
// 'unsafe-inline' on style-src is load-bearing and will have to stay: the
// per-tenant brand colour is injected as an inline <style> tag by
// lib/theme.ts (brandThemeStyleTag), and Tailwind emits inline styles too.
const CSP_REPORT_ONLY = [
  `default-src 'self'`,
  // 'unsafe-inline'/'unsafe-eval' are what Next.js's own hydration and dev
  // tooling need. Tightening this to a nonce is the main win left once the
  // report-only pass is clean.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`,
  `font-src 'self' ${GOOGLE_FONTS_FILES}`,
  // data: covers the inline SVG icons; blob: covers the generated quote and
  // invoice PDFs (@react-pdf/renderer) before they're handed to the browser.
  `img-src 'self' data: blob: ${SUPABASE}`,
  `connect-src 'self' ${SUPABASE} ${SENTRY} ${STRIPE} ${GOOGLE_APIS}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const securityHeaders = [
  // Multi-tenant app holding customer PII and Stripe Connect account ids -
  // never let it be framed. frame-ancestors in the CSP above is the modern
  // equivalent, but that's Report-Only for now, so this is what's actually
  // enforcing clickjacking protection today.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Full URL to our own origin, bare origin cross-site: the public portal,
  // quote and invoice routes carry a secret token in the path, and this stops
  // that token leaking to third parties through the Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Two years, subdomains included - every tenant is a subdomain or a custom
  // domain pointed at Vercel, all served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

// Project photos live in this project's own Supabase Storage bucket, so the
// allowed image host is derived from the same env var the Supabase client
// uses rather than hard-coded - each deploy points at its own project.
// Wrapped in a try/catch because next.config.js is also evaluated in places
// where the env var may not be set (a bare `next lint`, for instance), and a
// throw here would take down the whole build.
function supabaseImagePatterns() {
  try {
    const { hostname } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return hostname ? [{ protocol: "https", hostname, pathname: "/storage/v1/object/public/**" }] : [];
  } catch {
    return [];
  }
}

const nextConfig = {
  images: {
    remotePatterns: supabaseImagePatterns(),
    // Deliberately NOT enabling dangerouslyAllowSVG. Tenants upload their own
    // logos and the upload field accepts image/svg+xml; an SVG run through
    // the optimizer is an untrusted document served from our own origin,
    // which is a stored-XSS shape. Those logos stay as plain <img> tags
    // (they render at 48px, so there's nothing meaningful to optimise) and
    // only the photo grids use next/image.
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;

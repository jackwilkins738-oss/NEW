import tls from "node:tls";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/jobs";

// Is every client's website up, and is its certificate fine? Checked hourly
// (/api/cron/hourly). Hearing it from a monitor at 3am beats hearing it from
// a client whose phone stopped ringing. Down means two failed checks in a
// row, so one slow response isn't an alarm; back up is reported with how long
// it was out. A certificate within 14 days of expiry gets one warning a week
// (Cloudflare renews on its own, so this only fires when something's wrong).

export type SiteState = { site_status: string | null; site_fail_count: number; site_down_since: string | null };
export type CheckResult = { ok: boolean; reason: string };
export type Transition = { state: SiteState; alert: null | { kind: "down" | "up"; text: string } };

const FAILS_BEFORE_DOWN = 2;
export const CERT_WARN_DAYS = 14;

/** What a check result does to a site's state, and whether to tell anyone. Pure. */
export function nextSiteState(prev: SiteState, result: CheckResult, now: Date): Transition {
  if (result.ok) {
    const wasDown = prev.site_status === "down";
    const minutes = wasDown && prev.site_down_since ? Math.round((now.getTime() - Date.parse(prev.site_down_since)) / 60_000) : 0;
    return {
      state: { site_status: "up", site_fail_count: 0, site_down_since: null },
      alert: wasDown ? { kind: "up", text: `back up after about ${minutes < 90 ? `${minutes} minutes` : `${Math.round(minutes / 60)} hours`}` } : null,
    };
  }
  const fails = prev.site_fail_count + 1;
  if (prev.site_status === "down") return { state: { ...prev, site_fail_count: fails }, alert: null };
  if (fails >= FAILS_BEFORE_DOWN) {
    return {
      state: { site_status: "down", site_fail_count: fails, site_down_since: now.toISOString() },
      alert: { kind: "down", text: result.reason },
    };
  }
  return { state: { ...prev, site_fail_count: fails }, alert: null };
}

/** Loads the page the way a visitor would: must answer 2xx/3xx within 20 seconds over valid HTTPS. */
export async function checkSite(url: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "ScalarDigital-Monitor/1.0" }, cache: "no-store" });
    return res.status < 400 ? { ok: true, reason: "" } : { ok: false, reason: `the page answers with an error (HTTP ${res.status})` };
  } catch (err) {
    const msg = String((err as { cause?: { code?: string } })?.cause?.code ?? (err as Error)?.name ?? err);
    if (/CERT|SSL|TLS/i.test(msg)) return { ok: false, reason: "its security certificate isn't valid - browsers will show a warning" };
    if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return { ok: false, reason: "its domain doesn't resolve - check the DNS or the domain renewal" };
    if (/Timeout|ABORT/i.test(msg)) return { ok: false, reason: "it didn't answer within 20 seconds" };
    return { ok: false, reason: `it can't be reached (${msg.slice(0, 60)})` };
  }
}

/** Days until the site's certificate expires, or null if it can't be read. */
export function certDaysLeft(host: string, now = Date.now()): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? Math.floor((Date.parse(cert.valid_to) - now) / 86_400_000) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function adminEmails(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const out: string[] = [];
  for (const a of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(a.user_id);
    if (data.user?.email) out.push(data.user.email);
  }
  return out;
}

export async function checkClientSites(now = new Date()): Promise<{ checked: number; alerts: number }> {
  const admin = createAdminClient();
  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id, business_name, website_url, site_status, site_fail_count, site_down_since, site_cert_warned_at")
    .not("website_url", "is", null);
  if (error || !tenants || tenants.length === 0) return { checked: 0, alerts: 0 };

  const alerts: string[] = [];
  // All at once: each check can take up to 30 seconds, and the hourly route has a minute.
  await Promise.all(tenants.map(async (t) => {
    try {
      const result = await checkSite(t.website_url!);
      const { state, alert } = nextSiteState(t, result, now);
      const update: Record<string, unknown> = { ...state };
      if (alert?.kind === "down") alerts.push(`<li><strong>${escapeHtml(t.business_name)}</strong> is DOWN: ${escapeHtml(alert.text)}. <a href="${t.website_url}">${escapeHtml(t.website_url!)}</a></li>`);
      if (alert?.kind === "up") alerts.push(`<li><strong>${escapeHtml(t.business_name)}</strong> is ${escapeHtml(alert.text)}.</li>`);

      const weekAgo = now.getTime() - 7 * 86_400_000;
      if (result.ok && (!t.site_cert_warned_at || Date.parse(t.site_cert_warned_at) < weekAgo)) {
        const days = await certDaysLeft(new URL(t.website_url!).hostname, now.getTime());
        if (days !== null && days <= CERT_WARN_DAYS) {
          alerts.push(`<li><strong>${escapeHtml(t.business_name)}</strong>: the security certificate expires in ${days} day${days === 1 ? "" : "s"}. Cloudflare normally renews it - check the domain's DNS still points at Cloudflare.</li>`);
          update.site_cert_warned_at = now.toISOString();
        }
      }
      await admin.from("tenants").update(update).eq("id", t.id);
    } catch (err) {
      console.error(`Site check failed for tenant ${t.id}:`, err);
      Sentry.captureException(err);
    }
  }));

  if (alerts.length > 0) {
    const to = await adminEmails(admin);
    if (to.length > 0) {
      await sendEmail({
        to,
        subject: alerts.some((a) => a.includes("DOWN")) ? "Client website down" : "Client website update",
        html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;"><ul style="padding-left:18px;">${alerts.join("")}</ul></div>`,
      });
    }
  }
  return { checked: tenants.length, alerts: alerts.length };
}

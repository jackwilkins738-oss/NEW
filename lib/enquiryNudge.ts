import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { businessRecipients } from "@/lib/jobs";
import { escapeHtml } from "@/lib/contact";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { DEMO_SLUG } from "@/lib/demo";

// An enquiry nobody has touched an hour after it arrived gets one nudge to
// the business - the most expensive leak in a trade business is the lead
// that was seen on a phone, meant to be rung back, and forgotten. "Touched"
// means its status moved on from "new". Quiet overnight: a late-evening
// enquiry is nudged at 7am instead. Once per enquiry. Runs hourly
// (.github/workflows/hourly.yml -> /api/cron/hourly).

const AFTER_MS = 60 * 60_000;
const GIVE_UP_MS = 24 * 60 * 60_000;

export type NudgeLead = { status: string; created_at: string; nudged_at: string | null };

/** The UK hour of the day, 0-23. */
export function ukHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(now));
}

export function dueForNudge(lead: NudgeLead, now: Date): boolean {
  if (lead.status !== "new" || lead.nudged_at) return false;
  const age = now.getTime() - Date.parse(lead.created_at);
  if (age < AFTER_MS || age > GIVE_UP_MS) return false;
  const hour = ukHour(now);
  return hour >= 7 && hour < 21;
}

export async function sendEnquiryNudges(now = new Date()): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const { data: leads } = await admin
    .from("leads")
    .select("id, tenant_id, name, email, phone, job_type, status, created_at, nudged_at")
    .eq("status", "new")
    .is("nudged_at", null)
    .gte("created_at", new Date(now.getTime() - GIVE_UP_MS).toISOString())
    .lte("created_at", new Date(now.getTime() - AFTER_MS).toISOString());
  const due = (leads ?? []).filter((l) => dueForNudge(l, now));
  if (due.length === 0) return { checked: 0, sent: 0 };

  const tenantIds = [...new Set(due.map((l) => l.tenant_id))];
  const { data: tenants } = await admin.from("tenants").select("id, business_name, domain, slug, contact_email").in("id", tenantIds);

  let sent = 0;
  for (const tenant of tenants ?? []) {
    const mine = due.filter((l) => l.tenant_id === tenant.id);
    if (tenant.slug === DEMO_SLUG) continue; // the sales demo's enquiries are made up
    try {
      const to = await businessRecipients(admin, tenant.id, tenant.contact_email);
      if (to.length > 0) {
        const rows = mine
          .map((l) => {
            const who = escapeHtml(l.name || l.email || l.phone || "Someone");
            const tel = (l.phone ?? "").replace(/[^\d+]/g, "");
            const since = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit" }).format(new Date(l.created_at));
            return `<li style="margin-bottom:8px;"><strong>${who}</strong>${l.job_type ? ` - ${escapeHtml(l.job_type)}` : ""} (enquired at ${since})${
              tel ? ` - <a href="tel:${escapeHtml(tel)}">call ${escapeHtml(l.phone!)}</a>` : l.email ? ` - ${escapeHtml(l.email)}` : ""
            }</li>`;
          })
          .join("");
        await sendEmail({
          to,
          subject: mine.length === 1 ? `Still waiting to hear back: ${mine[0].name || "a new enquiry"}` : `${mine.length} enquiries still waiting to hear back`,
          html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
            <p>${mine.length === 1 ? "This enquiry hasn't" : "These enquiries haven't"} been answered yet:</p>
            <ul>${rows}</ul>
            <p>Most customers book whoever gets back to them first. Once you've been in touch, set the enquiry to "Contacted" on <a href="${tenantOrigin(tenant)}/dashboard">your dashboard</a>.</p>
          </div>`,
        });
        sent += mine.length;
      }
      // Marked either way, so a business with nobody to email isn't re-checked every hour.
      await admin.from("leads").update({ nudged_at: now.toISOString() }).in("id", mine.map((l) => l.id));
    } catch (err) {
      console.error(`Enquiry nudge failed for tenant ${tenant.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { checked: due.length, sent };
}

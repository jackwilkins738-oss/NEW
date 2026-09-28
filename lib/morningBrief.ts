import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { todayInUK } from "@/lib/ukDate";
import { businessRecipients } from "@/lib/jobs";
import { customerContact, escapeHtml, mapsLink, ukVisitTime } from "@/lib/contact";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { DEMO_SLUG } from "@/lib/demo";

// The business's day on one screen, in their inbox at about 7am: today's
// visits (tap for directions, tap to call), enquiries nobody has answered,
// money that's overdue, and quotes waiting on an answer. Nothing to say, no
// email. On by default, off in Settings (migration 048). Runs from the daily
// calendar-sync cron.

export type BriefVisit = { client: string; at: string; location: string | null; phone: string | null; jobUrl: string };
export type BriefInput = {
  businessName: string;
  dashboardUrl: string;
  visits: BriefVisit[];
  newEnquiries: { name: string; jobType: string | null }[];
  overdue: { count: number; pence: number };
  quotesWaiting: { count: number; pence: number };
};

/** The brief's subject and body, or null when there's nothing worth an email. */
export function briefEmail(b: BriefInput): { subject: string; html: string } | null {
  if (b.visits.length === 0 && b.newEnquiries.length === 0 && b.overdue.count === 0 && b.quotesWaiting.count === 0) return null;

  const parts: string[] = [];
  const summary: string[] = [];
  if (b.visits.length > 0) {
    summary.push(`${b.visits.length} visit${b.visits.length === 1 ? "" : "s"}`);
    const rows = [...b.visits]
      .sort((x, y) => x.at.localeCompare(y.at))
      .map((v) => {
        const tel = (v.phone ?? "").replace(/[^\d+]/g, "");
        const links = [
          v.location ? `<a href="${mapsLink(v.location)}">directions</a>` : "",
          tel ? `<a href="tel:${escapeHtml(tel)}">call</a>` : "",
          `<a href="${v.jobUrl}">job</a>`,
        ].filter(Boolean);
        return `<li style="margin-bottom:8px;"><strong>${ukVisitTime(v.at).time}</strong> ${escapeHtml(v.client)}${
          v.location ? `, ${escapeHtml(v.location)}` : ""
        }<br><span style="font-size:13px;">${links.join(" &middot; ")}</span></li>`;
      })
      .join("");
    parts.push(`<h3 style="margin:18px 0 6px;">Today's visits</h3><ul style="padding-left:18px;">${rows}</ul>`);
  }
  if (b.newEnquiries.length > 0) {
    summary.push(`${b.newEnquiries.length} to reply to`);
    const names = b.newEnquiries
      .slice(0, 8)
      .map((e) => `<li>${escapeHtml(e.name)}${e.jobType ? ` - ${escapeHtml(e.jobType)}` : ""}</li>`)
      .join("");
    const more = b.newEnquiries.length > 8 ? `<li>and ${b.newEnquiries.length - 8} more</li>` : "";
    parts.push(`<h3 style="margin:18px 0 6px;">Enquiries waiting for a reply</h3><ul style="padding-left:18px;">${names}${more}</ul>`);
  }
  if (b.overdue.count > 0) {
    summary.push(`${formatGBP(b.overdue.pence)} overdue`);
    parts.push(
      `<h3 style="margin:18px 0 6px;">Overdue</h3><p style="margin:0;">${b.overdue.count} invoice${b.overdue.count === 1 ? "" : "s"}, ${formatGBP(
        b.overdue.pence
      )} outstanding.</p>`
    );
  }
  if (b.quotesWaiting.count > 0) {
    parts.push(
      `<h3 style="margin:18px 0 6px;">Quotes waiting on an answer</h3><p style="margin:0;">${b.quotesWaiting.count} quote${
        b.quotesWaiting.count === 1 ? "" : "s"
      } worth ${formatGBP(b.quotesWaiting.pence)}.</p>`
    );
  }

  return {
    subject: `Today: ${summary.length > 0 ? summary.join(", ") : "quotes to follow up"}`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;max-width:560px;">
      ${parts.join("")}
      <p style="margin-top:22px;"><a href="${b.dashboardUrl}">Open your dashboard</a></p>
      <p style="color:#6b6255;font-size:12px;">${escapeHtml(b.businessName)}'s morning brief. Turn it off in Settings.</p>
    </div>`,
  };
}

export async function sendMorningBriefs(now = new Date()): Promise<{ sent: number }> {
  const admin = createAdminClient();
  // Never the sales demo: its data is made up and its only member is Scalar's own admin.
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, domain, slug, contact_email")
    .eq("morning_brief", true)
    .neq("slug", DEMO_SLUG);
  if (!tenants || tenants.length === 0) return { sent: 0 };
  const today = todayInUK(now);

  let sent = 0;
  for (const tenant of tenants) {
    try {
      const origin = tenantOrigin(tenant);
      const [visitsRes, leadsRes, invoicesRes, quotesRes] = await Promise.all([
        admin
          .from("projects")
          .select("id, client_name, location, next_visit_at, customer_id, lead_id, quote_id")
          .eq("tenant_id", tenant.id)
          .is("completed_at", null)
          .gte("next_visit_at", new Date(now.getTime() - 12 * 3_600_000).toISOString())
          .lte("next_visit_at", new Date(now.getTime() + 36 * 3_600_000).toISOString()),
        admin
          .from("leads")
          .select("name, email, phone, job_type")
          .eq("tenant_id", tenant.id)
          .eq("status", "new")
          .gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString()),
        admin.from("invoices").select("amount_pence, paid_pence").eq("tenant_id", tenant.id).in("status", ["unpaid", "part_paid"]).lt("due_date", today),
        admin.from("quotes").select("total_pence").eq("tenant_id", tenant.id).eq("status", "sent"),
      ]);

      const todays = (visitsRes.data ?? []).filter((p) => p.next_visit_at && todayInUK(new Date(p.next_visit_at)) === today);
      const visits: BriefVisit[] = [];
      for (const p of todays) {
        const { phone } = await customerContact(admin, p);
        visits.push({ client: p.client_name, at: p.next_visit_at!, location: p.location, phone, jobUrl: `${origin}/projects/${p.id}` });
      }
      const overdue = invoicesRes.data ?? [];
      const quotes = quotesRes.data ?? [];
      const email = briefEmail({
        businessName: tenant.business_name,
        dashboardUrl: `${origin}/dashboard`,
        visits,
        newEnquiries: (leadsRes.data ?? []).map((l) => ({ name: l.name || l.email || l.phone || "Someone", jobType: l.job_type })),
        overdue: { count: overdue.length, pence: overdue.reduce((s, i) => s + i.amount_pence - (i.paid_pence ?? 0), 0) },
        quotesWaiting: { count: quotes.length, pence: quotes.reduce((s, q) => s + q.total_pence, 0) },
      });
      if (!email) continue;
      const to = await businessRecipients(admin, tenant.id, tenant.contact_email);
      if (to.length === 0) continue;
      await sendEmail({ to, ...email });
      sent++;
    } catch (err) {
      console.error(`Morning brief failed for tenant ${tenant.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { sent };
}

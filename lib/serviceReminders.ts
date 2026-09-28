import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { todayInUK } from "@/lib/ukDate";
import { customerContact, escapeHtml } from "@/lib/contact";
import { DEMO_SLUG } from "@/lib/demo";

// Repeat work that arrives by itself: a boiler service, a gas safety
// certificate, an EICR, a gutter clear, a chimney sweep. The business sets
// one on a job ("remind in 12 months, every year"); on the day, the customer
// is emailed to book in, and a repeating reminder schedules the next one.
// Runs daily from the calendar-sync cron.

/** YYYY-MM-DD `months` later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** "12 months" -> "a year", "24" -> "2 years", "6" -> "6 months". */
export function sinceLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? "a year" : `${months / 12} years`;
  return months === 1 ? "a month" : `${months} months`;
}

export function serviceReminderEmail(customerName: string, businessName: string, label: string, monthsSince: number | null) {
  const first = escapeHtml(customerName.trim().split(/\s+/)[0] || "there");
  const business = escapeHtml(businessName);
  const what = escapeHtml(label.trim());
  return {
    subject: `Time to book your ${label.trim().toLowerCase()} - ${businessName}`,
    html: `<p>Hi ${first},</p>
      <p>${monthsSince ? `It's been ${sinceLabel(monthsSince)} since we were last with you, so it's` : "It's"} time for your <strong>${what}</strong>.</p>
      <p>Just reply to this email with a couple of days that suit you and we'll get you booked in.</p>
      <p>${business}</p>`,
  };
}

export async function sendServiceReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const today = todayInUK(now);
  const { data: due } = await admin
    .from("service_reminders")
    .select("id, tenant_id, project_id, label, due_on, repeat_months, created_at")
    .is("sent_at", null)
    .lte("due_on", today);
  if (!due || due.length === 0) return { checked: 0, sent: 0 };

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, contact_email, slug")
    .in("id", [...new Set(due.map((r) => r.tenant_id))]);
  const { data: projects } = await admin
    .from("projects")
    .select("id, client_name, customer_id, lead_id, quote_id")
    .in("id", [...new Set(due.map((r) => r.project_id))]);

  let sent = 0;
  for (const reminder of due) {
    const tenant = (tenants ?? []).find((t) => t.id === reminder.tenant_id);
    const project = (projects ?? []).find((p) => p.id === reminder.project_id);
    if (!tenant || !project || tenant.slug === DEMO_SLUG) continue;
    try {
      const { email } = await customerContact(admin, project);
      const sentAt = new Date().toISOString();
      if (email) {
        const monthsSince = reminder.repeat_months ?? null;
        await sendEmail({
          to: [email],
          ...serviceReminderEmail(project.client_name, tenant.business_name, reminder.label, monthsSince),
          replyTo: tenant.contact_email ?? undefined,
        });
        await admin.from("communications").insert({
          tenant_id: reminder.tenant_id,
          project_id: reminder.project_id,
          type: "email",
          summary: `Service reminder emailed: ${reminder.label}`,
        });
        sent++;
      }
      // Marked done even with no email on file, so it isn't retried forever;
      // the next one is still booked for a repeating reminder.
      await admin.from("service_reminders").update({ sent_at: sentAt }).eq("id", reminder.id);
      if (reminder.repeat_months) {
        await admin.from("service_reminders").insert({
          tenant_id: reminder.tenant_id,
          project_id: reminder.project_id,
          label: reminder.label,
          due_on: addMonths(reminder.due_on, reminder.repeat_months),
          repeat_months: reminder.repeat_months,
        });
      }
    } catch (err) {
      console.error(`Service reminder failed for ${reminder.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { checked: due.length, sent };
}

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { todayInUK } from "@/lib/ukDate";
import { addDays } from "@/lib/jobs";
import { customerContact, escapeHtml, ukVisitTime } from "@/lib/contact";
import { DEMO_SLUG } from "@/lib/demo";

// The day before a booked visit, the customer gets a short email saying when
// to expect the business - the reminder that stops "what time are you
// coming?" calls and wasted trips to an empty house. Only for businesses that
// turned it on (migration 048), only for jobs not yet complete, and once per
// booked time: moving the visit sends a fresh one. Runs daily from the
// calendar-sync cron (6am UTC), so it lands the morning before.

export type VisitProject = {
  next_visit_at: string | null;
  visit_reminded_for: string | null;
  completed_at: string | null;
};

/** Whether this job's visit is tomorrow (UK) and hasn't been reminded for this exact time yet. */
export function dueVisitReminder(p: VisitProject, now: Date): boolean {
  if (!p.next_visit_at || p.completed_at) return false;
  const visitDay = todayInUK(new Date(p.next_visit_at));
  if (visitDay !== addDays(todayInUK(now), 1)) return false;
  return !p.visit_reminded_for || Date.parse(p.visit_reminded_for) !== Date.parse(p.next_visit_at);
}

export function visitReminderEmail(customerName: string, businessName: string, visitAt: string, location: string | null) {
  const { day, time } = ukVisitTime(visitAt);
  const first = escapeHtml(customerName.trim().split(/\s+/)[0] || "there");
  const business = escapeHtml(businessName);
  return {
    subject: `See you tomorrow at ${time} - ${businessName}`,
    html: `<p>Hi ${first},</p>
      <p>Just a reminder that ${business} is booked to come ${location ? `to ${escapeHtml(location)} ` : ""}tomorrow, ${escapeHtml(day)}, at <strong>${time}</strong>.</p>
      <p>If that time no longer works, just reply to this email and we'll rearrange.</p>
      <p>${business}</p>`,
  };
}

export async function sendVisitReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, contact_email")
    .eq("visit_reminders", true)
    .neq("slug", DEMO_SLUG);
  if (!tenants || tenants.length === 0) return { checked: 0, sent: 0 };

  // Anything in the next two days; the exact "tomorrow in the UK" test is dueVisitReminder's.
  const { data: projects } = await admin
    .from("projects")
    .select("id, tenant_id, client_name, location, next_visit_at, visit_reminded_for, completed_at, customer_id, lead_id, quote_id")
    .in("tenant_id", tenants.map((t) => t.id))
    .is("completed_at", null)
    .gte("next_visit_at", now.toISOString())
    .lte("next_visit_at", new Date(now.getTime() + 2 * 86_400_000).toISOString());
  const due = (projects ?? []).filter((p) => dueVisitReminder(p, now));

  let sent = 0;
  for (const project of due) {
    const tenant = tenants.find((t) => t.id === project.tenant_id)!;
    try {
      const { email } = await customerContact(admin, project);
      if (!email) continue;
      await sendEmail({
        to: [email],
        ...visitReminderEmail(project.client_name, tenant.business_name, project.next_visit_at!, project.location),
        replyTo: tenant.contact_email ?? undefined,
      });
      await admin.from("projects").update({ visit_reminded_for: project.next_visit_at }).eq("id", project.id);
      await admin.from("communications").insert({
        tenant_id: project.tenant_id,
        project_id: project.id,
        type: "email",
        summary: "Visit reminder emailed to customer (automatic)",
      });
      sent++;
    } catch (err) {
      console.error(`Visit reminder failed for project ${project.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { checked: due.length, sent };
}

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { todayInUK, daysBetweenUK } from "@/lib/ukDate";

// Called once a day from the calendar-sync cron rather than getting its own
// vercel.json entry - Vercel's free Hobby plan caps a project at 2 cron
// jobs, and this project already has weekly-digest + calendar-sync, so a
// third entry would either fail to deploy or need Pro. Piggybacking here
// costs nothing extra (calendar-sync already runs daily) and keeps every
// cron job on the free tier.
//
// Emails the customer directly (not just the business owner's own
// dashboard) once an invoice is overdue, then again every
// REMINDER_INTERVAL_DAYS it stays unpaid rather than every single day.
const REMINDER_INTERVAL_DAYS = 7;

export async function sendPaymentReminders(): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const today = todayInUK();
  const reminderCutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 86_400_000).toISOString();

  const { data: invoices } = await admin
    .from("invoices")
    .select(
      "id, tenant_id, client_name, invoice_number, amount_pence, paid_pence, due_date, view_token, customer_id, lead_id, project_id, last_reminder_sent_at"
    )
    .in("status", ["unpaid", "part_paid"])
    .lt("due_date", today);

  if (!invoices || invoices.length === 0) return { checked: 0, sent: 0 };

  const due = invoices.filter((inv) => !inv.last_reminder_sent_at || inv.last_reminder_sent_at < reminderCutoff);

  let sent = 0;

  for (const invoice of due) {
    try {
      let recipient: string | null = null;
      if (invoice.customer_id) {
        const { data: customer } = await admin.from("customers").select("email").eq("id", invoice.customer_id).maybeSingle();
        recipient = customer?.email ?? null;
      }
      if (!recipient && invoice.lead_id) {
        const { data: lead } = await admin.from("leads").select("email").eq("id", invoice.lead_id).maybeSingle();
        recipient = lead?.email ?? null;
      }
      if (!recipient && invoice.project_id) {
        const { data: project } = await admin.from("projects").select("customer_id").eq("id", invoice.project_id).maybeSingle();
        if (project?.customer_id) {
          const { data: customer } = await admin.from("customers").select("email").eq("id", project.customer_id).maybeSingle();
          recipient = customer?.email ?? null;
        }
      }
      if (!recipient) continue;

      const { data: tenant } = await admin
        .from("tenants")
        .select("business_name, domain, contact_email")
        .eq("id", invoice.tenant_id)
        .maybeSingle();
      if (!tenant) continue;

      const outstanding = invoice.amount_pence - (invoice.paid_pence ?? 0);
      const origin = tenant.domain ? `https://${tenant.domain}` : "https://scalardigital.co.uk";
      const viewUrl = `${origin}/invoice/${invoice.id}/${invoice.view_token}`;
      const daysOverdue = daysBetweenUK(invoice.due_date, todayInUK());

      await sendEmail({
        to: [recipient],
        subject: `Payment reminder: invoice ${invoice.invoice_number ?? ""} from ${tenant.business_name}`.trim(),
        html: `
          <p>Hi ${invoice.client_name},</p>
          <p>This is a reminder that ${tenant.business_name}'s invoice${invoice.invoice_number ? ` ${invoice.invoice_number}` : ""}
             for ${formatGBP(outstanding)} was due ${daysOverdue === 0 ? "today" : `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago`}.</p>
          <p><a href="${viewUrl}">View and pay your invoice</a></p>
        `,
        replyTo: tenant.contact_email ?? undefined,
      });

      await admin.from("invoices").update({ last_reminder_sent_at: new Date().toISOString() }).eq("id", invoice.id);
      sent++;
    } catch (err) {
      console.error(`Payment reminder failed for invoice ${invoice.id}:`, err);
      Sentry.captureException(err);
    }
  }

  return { checked: due.length, sent };
}

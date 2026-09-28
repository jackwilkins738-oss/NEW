import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { todayInUK } from "@/lib/ukDate";
import { tenantOrigin } from "@/lib/tenantOrigin";

// Follows up sent quotes that haven't been answered - the single most common
// reason a trade loses work it quoted for is simply never chasing it.
// Chase 1 goes 3 days after the quote was sent, chase 2 four days after that;
// never a third. Only for businesses that turned it on (migration 044), only
// quotes still "sent" (not accepted, declined or expired), and only where
// there's a customer email. Runs daily from the calendar-sync cron.

const FIRST_AFTER_DAYS = 3;
const SECOND_AFTER_DAYS = 4;
const MAX_CHASES = 2;
const DAY = 86_400_000;

export type ChaseQuote = {
  status: string;
  customer_email: string | null;
  sent_at: string | null;
  expires_at: string | null;
  chase_count: number;
  last_chased_at: string | null;
};

/** Whether this quote is due a chaser now. Pure, so the rules are tested in one place. */
export function dueForChase(q: ChaseQuote, now: number, todayUK: string): boolean {
  if (q.status !== "sent" || !q.customer_email || !q.sent_at) return false;
  if (q.chase_count >= MAX_CHASES) return false;
  if (q.expires_at && q.expires_at < todayUK) return false;
  if (q.chase_count === 0) return now - Date.parse(q.sent_at) >= FIRST_AFTER_DAYS * DAY;
  return !!q.last_chased_at && now - Date.parse(q.last_chased_at) >= SECOND_AFTER_DAYS * DAY;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendQuoteChasers(): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, domain, slug, contact_email")
    .eq("quote_chasers", true);
  if (!tenants || tenants.length === 0) return { checked: 0, sent: 0 };

  const { data: quotes } = await admin
    .from("quotes")
    .select("id, tenant_id, client_name, quote_number, total_pence, accept_token, status, customer_email, sent_at, expires_at, chase_count, last_chased_at")
    .in("tenant_id", tenants.map((t) => t.id))
    .eq("status", "sent")
    .lt("chase_count", MAX_CHASES);
  const now = Date.now();
  const today = todayInUK();
  const due = (quotes ?? []).filter((q) => dueForChase(q, now, today));

  let sent = 0;
  for (const quote of due) {
    const tenant = tenants.find((t) => t.id === quote.tenant_id)!;
    try {
      const url = `${tenantOrigin(tenant)}/quote/${quote.id}/${quote.accept_token}`;
      const business = escapeHtml(tenant.business_name);
      const first = quote.chase_count === 0;
      await sendEmail({
        to: [quote.customer_email!],
        subject: first
          ? `Your quote from ${tenant.business_name}${quote.quote_number ? ` (${quote.quote_number})` : ""}`
          : `Any questions about your quote? - ${tenant.business_name}`,
        html: first
          ? `<p>Hi ${escapeHtml(quote.client_name)},</p>
             <p>Just checking my quote reached you - ${formatGBP(quote.total_pence)}, and you can read it and accept it here:</p>
             <p><a href="${url}">View your quote</a></p>
             <p>If anything needs changing, or you'd like to talk it through, just reply to this email.</p>
             <p>${business}</p>`
          : `<p>Hi ${escapeHtml(quote.client_name)},</p>
             <p>One last note on the quote I sent - if the timing's not right or you've gone another way, no problem at all, just let me know.
             If you have any questions, reply here and I'll get straight back to you.</p>
             <p><a href="${url}">View your quote</a></p>
             <p>${business}</p>`,
        replyTo: tenant.contact_email ?? undefined,
      });
      await admin
        .from("quotes")
        .update({ chase_count: quote.chase_count + 1, last_chased_at: new Date().toISOString() })
        .eq("id", quote.id);
      sent++;
    } catch (err) {
      console.error(`Quote chaser failed for quote ${quote.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { checked: due.length, sent };
}

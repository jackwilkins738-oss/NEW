import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { answeredCount, normaliseAnswers, ONBOARDING_QUESTION_COUNT } from "@/lib/onboarding";

// A client said yes, then never sent their website details - the most common
// reason a build stalls. Reminder 1 goes 2 days after they accepted the
// quote, reminder 2 five days after that; never a third. The second also
// tells the business, so it becomes a phone call rather than more email.
// Someone who's been filling it in within the last 2 days is left alone -
// they're on it. Only onboarding rows exist for Scalar's own outreach
// quotes, so no other tenant's customers are ever emailed. Runs daily from
// the calendar-sync cron (migration 055).

const FIRST_AFTER_DAYS = 2;
const SECOND_AFTER_DAYS = 5;
const QUIET_DAYS = 2;
const MAX_CHASES = 2;
const DAY = 86_400_000;

export type ChaseOnboarding = {
  submitted_at: string | null;
  updated_at: string;
  chase_count: number;
  last_chased_at: string | null;
  quote: { status: string; accepted_at: string | null; customer_email: string | null } | null;
};

/** Whether this client is due a reminder now. Pure, so the rules are tested in one place. */
export function dueForOnboardingChase(o: ChaseOnboarding, now: number): boolean {
  const q = o.quote;
  if (o.submitted_at || !q || q.status !== "accepted" || !q.accepted_at || !q.customer_email) return false;
  if (o.chase_count >= MAX_CHASES) return false;
  const accepted = Date.parse(q.accepted_at);
  const touched = Date.parse(o.updated_at);
  if (touched > accepted && now - touched < QUIET_DAYS * DAY) return false;
  if (o.chase_count === 0) return now - accepted >= FIRST_AFTER_DAYS * DAY;
  return !!o.last_chased_at && now - Date.parse(o.last_chased_at) >= SECOND_AFTER_DAYS * DAY;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendOnboardingChasers(): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("onboarding")
    .select("id, tenant_id, token, client_name, answers, quote_id, submitted_at, updated_at, chase_count, last_chased_at")
    .is("submitted_at", null)
    .lt("chase_count", MAX_CHASES);
  if (!rows || rows.length === 0) return { checked: 0, sent: 0 };

  const { data: quotes } = await admin
    .from("quotes")
    .select("id, status, accepted_at, customer_email")
    .in("id", rows.map((r) => r.quote_id))
    .eq("status", "accepted");
  const now = Date.now();
  const due = rows
    .map((r) => ({ ...r, quote: (quotes ?? []).find((q) => q.id === r.quote_id) ?? null }))
    .filter((r) => dueForOnboardingChase(r, now));
  if (due.length === 0) return { checked: 0, sent: 0 };

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, domain, slug, contact_email")
    .in("id", [...new Set(due.map((r) => r.tenant_id))]);

  let sent = 0;
  for (const row of due) {
    const tenant = (tenants ?? []).find((t) => t.id === row.tenant_id);
    if (!tenant) continue;
    try {
      const url = `${tenantOrigin(tenant)}/welcome/${row.id}/${row.token}`;
      const business = escapeHtml(tenant.business_name);
      const client = escapeHtml(row.client_name);
      const answered = answeredCount(normaliseAnswers(row.answers));
      const progress = answered > 0
        ? `<p>You've answered ${answered} of ${ONBOARDING_QUESTION_COUNT} so far - it's all saved, so you can carry on where you left off.</p>`
        : "";
      const first = row.chase_count === 0;
      await sendEmail({
        to: [row.quote!.customer_email!],
        subject: first ? `Your new website - the details we need for ${row.client_name}` : `Still keen to get ${row.client_name}'s site built`,
        html: first
          ? `<p>Hi,</p>
             <p>Just a nudge on the next step for ${client}'s new website: a few short questions about what you do and where you work, and a handful of photos of your work. Ten minutes, straight from your phone.</p>
             ${progress}
             <p><a href="${url}">Add your details</a></p>
             <p>Easier to do it over the phone? Just reply and say when suits.</p>
             <p>${business}</p>`
          : `<p>Hi,</p>
             <p>I'm ready to start on ${client}'s website as soon as I have your details - what you do, the towns you cover, and a few photos of your work.</p>
             ${progress}
             <p><a href="${url}">Add your details</a></p>
             <p>If it's easier, reply with a good time and I'll ring you and fill it in with you.</p>
             <p>${business}</p>`,
        replyTo: tenant.contact_email ?? undefined,
      });
      if (!first && tenant.contact_email) {
        await sendEmail({
          to: [tenant.contact_email],
          subject: `${row.client_name} still hasn't sent their website details`,
          html: `<p>${client} accepted their quote but hasn't sent their details, after two reminders${answered ? ` (${answered} answers saved so far)` : ""}. Worth a phone call - you could fill it in together: <a href="${url}">their page</a>.</p>`,
        });
      }
      await admin
        .from("onboarding")
        .update({ chase_count: row.chase_count + 1, last_chased_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch (err) {
      console.error(`Onboarding chaser failed for ${row.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { checked: due.length, sent };
}

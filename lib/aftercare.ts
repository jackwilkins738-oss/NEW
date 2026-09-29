// Aftercare reminders for Scalar Digital's own customers (the tenants of
// this dashboard), sent to the platform admin - never to the customer.
// They exist so the steps after a launch don't depend on anyone
// remembering them: the day 7 and 21 check-ins, the day 30 end of
// aftercare (with the review, case study and referral asks), and the
// warning before a customer's free dashboard hosting runs out.
//
// Pure calendar arithmetic on YYYY-MM-DD strings, same approach and reasons
// as lib/ukDate.ts: no instants, so BST can never shift a reminder by a day.

import { createAdminClient } from "@/lib/supabase/admin";
import { daysBetweenUK, todayInUK } from "@/lib/ukDate";
import { sendEmail } from "@/lib/email";
import { businessRecipients } from "@/lib/jobs";
import { DEMO_SLUG } from "@/lib/demo";

export type AftercareTenant = {
  business_name: string;
  launched_on: string | null;
  free_hosting_months: number;
};

export type AftercareReminder = { business_name: string; text: string };

/** YYYY-MM-DD plus whole months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const fmt = (dateStr: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(dateStr + "T00:00:00Z")
  );

export function aftercareRemindersFor(tenants: AftercareTenant[], todayUK: string): AftercareReminder[] {
  const out: AftercareReminder[] = [];
  for (const t of tenants) {
    if (!t.launched_on) continue;
    const day = daysBetweenUK(t.launched_on, todayUK);
    const name = t.business_name;

    if (day === 7) {
      out.push({ business_name: name, text: "Day 7 check-in: is everything working, and anything to tweak while it's included?" });
    } else if (day === 21) {
      out.push({ business_name: name, text: "Day 21 check-in: how are enquiries coming through? Nine days of aftercare left." });
    } else if (day === 30) {
      out.push({
        business_name: name,
        text: "Aftercare ends today. Ask for a testimonial, permission to use it as a case study, a Google review, and one referral by name. Send the referral link.",
      });
    }

    if (t.free_hosting_months > 0) {
      const ends = addMonths(t.launched_on, t.free_hosting_months);
      const until = daysBetweenUK(todayUK, ends);
      if (until === 30 || until === 7) {
        out.push({
          business_name: name,
          text: `Free dashboard hosting ends on ${fmt(ends)} (${until} days). Agree the optional £39 a month for the dashboard - the website stays theirs either way.`,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// The referral ask, sent to the client themselves (not to the admin) 45 days
// after launch - two weeks after the day-30 conversation, once the site has
// had time to bring them work. Their own link is filled in, so passing it on
// is one tap. The terms match scalardigital.co.uk/refer.
// ---------------------------------------------------------------------

export const REFERRAL_DAY = 45;
const SITE_URL = "https://www.scalardigital.co.uk";

export function referralLink(businessName: string): string {
  const who = businessName.replace(/[^\p{L}\p{N} .'&-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${SITE_URL}/contact?ref=${encodeURIComponent(who)}`;
}

/** The referral email for a client launched on `launchedOn`, or null if today isn't the day. */
export function referralEmailFor(t: { business_name: string; launched_on: string | null }, todayUK: string) {
  if (!t.launched_on || daysBetweenUK(t.launched_on, todayUK) !== REFERRAL_DAY) return null;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const link = referralLink(t.business_name);
  return {
    subject: "Know another trade who needs a better website?",
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;max-width:560px;">
      <p>Hi,</p>
      <p>Hope the new site's been bringing in work for ${esc(t.business_name)}.</p>
      <p>If you know another tradesperson whose website lets them down - a mate, a supplier, someone you sub to - here's your own link to pass on:</p>
      <p><a href="${link}">${esc(link)}</a></p>
      <p>They get <strong>15% off</strong> their build, and once theirs is paid for you get a thank-you worth 10% of it (£75 to £250) - off future work, or as cash if you'd rather.</p>
      <p>No need to reply unless someone's interested. Thanks again for trusting me with yours.</p>
      <p>Scalar Digital</p>
    </div>`,
  };
}

// ---------------------------------------------------------------------
// The sender, run once a day from the existing daily cron
// (app/api/cron/calendar-sync) alongside payment reminders, rather than as
// a cron of its own - Vercel plans cap how many cron jobs a project gets.
// Nothing due, no email.
// ---------------------------------------------------------------------


export async function sendAftercareReminders(): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, slug, contact_email, business_name, launched_on, free_hosting_months")
    .not("launched_on", "is", null);

  const today = todayInUK();

  // The client-facing referral ask goes out whether or not there are admin reminders today.
  let referrals = 0;
  for (const t of tenants ?? []) {
    const email = referralEmailFor(t, today);
    if (!email || t.slug === DEMO_SLUG) continue;
    const to = await businessRecipients(admin, t.id, t.contact_email);
    if (to.length === 0) continue;
    await sendEmail({ to, ...email, replyTo: "hello@scalardigital.co.uk" });
    referrals++;
  }

  const reminders = aftercareRemindersFor(tenants ?? [], today);
  if (reminders.length === 0) return { sent: referrals };

  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const emails: string[] = [];
  for (const a of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(a.user_id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return { sent: 0 };

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = reminders
    .map((r) => `<li style="margin-bottom:10px;"><strong>${esc(r.business_name)}</strong><br>${esc(r.text)}</li>`)
    .join("");

  await sendEmail({
    to: emails,
    subject: `Aftercare today: ${reminders.length} step${reminders.length === 1 ? "" : "s"}`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
      <p style="font-size:16px;">Due today (${today}):</p>
      <ul style="padding-left:18px;">${items}</ul>
    </div>`,
  });
  return { sent: reminders.length + referrals };
}

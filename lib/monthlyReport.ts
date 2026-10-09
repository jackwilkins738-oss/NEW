import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { todayInUK } from "@/lib/ukDate";
import { businessRecipients, escapeHtml } from "@/lib/jobs";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { DEMO_SLUG } from "@/lib/demo";
import { tapCounts } from "@/lib/contactTaps";
import { searchStats, type SearchStats } from "@/lib/searchConsole";
import { finishedJobsWithPhotos, growthPitch, jobPageCounts, type GrowthStats } from "@/lib/jobPosts";
import { planIncludes } from "@/lib/plans";

// On the 1st of each month, each of Scalar Digital's launched clients gets
// last month in numbers: visits to their website, taps on their phone number
// and WhatsApp, enquiries, quotes won and
// reviews. It's the proof the website and dashboard are earning their keep -
// what makes the £39/month an easy yes at month 13. Runs from the daily cron;
// only acts on the 1st (UK).

export type MonthStats = {
  visits: number;
  /** Taps on the site's call / WhatsApp links (migration 056) - optional so older callers still type-check. */
  callTaps?: number;
  whatsappTaps?: number;
  enquiries: number;
  quotesSent: number;
  quotesWon: number;
  wonPence: number;
  reviews: number;
  /** From Google Search Console, when the client's property is shared with us - else left out. */
  search?: SearchStats | null;
  /** Growth and Pro clients: what Local Growth did this month (job posts, migration 065). */
  growth?: GrowthStats | null;
  /** Care clients: finished jobs with photos last month - the case for Growth. */
  jobsWithPhotos?: number;
};

/** "2026-10-01" -> the month before it, as [first day, first day of the next month, "September 2026"]. */
export function previousMonth(todayUK: string): { from: string; to: string; label: string } {
  const [y, m] = todayUK.split("-").map(Number);
  const start = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1));
  const from = start.toISOString().slice(0, 10);
  const to = `${y}-${String(m).padStart(2, "0")}-01`;
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  return { from, to, label };
}

/** The report, or null for a month with nothing at all to show. */
export function monthlyReportEmail(businessName: string, monthLabel: string, s: MonthStats, dashboardUrl: string) {
  if (s.visits + (s.callTaps ?? 0) + (s.whatsappTaps ?? 0) + s.enquiries + s.quotesSent + s.quotesWon + s.reviews +
      (s.search?.impressions ?? 0) + (s.growth?.pagesPublished ?? 0) === 0) return null;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#56534a;">${label}</td><td style="padding:6px 0;font-weight:bold;font-size:18px;">${value}</td></tr>`;
  const rows = [
    row("Visits to your website", String(s.visits)),
    s.callTaps ? row("Taps on your phone number", String(s.callTaps)) : "",
    s.whatsappTaps ? row("Taps on WhatsApp", String(s.whatsappTaps)) : "",
    row("Enquiry forms sent", String(s.enquiries)),
    row("Quotes sent", String(s.quotesSent)),
    row("Quotes accepted", s.quotesWon > 0 ? `${s.quotesWon} (${formatGBP(s.wonPence)})` : "0"),
    s.reviews > 0 ? row("New reviews", String(s.reviews)) : "",
  ].join("");
  const g = s.search;
  const google = g && g.impressions > 0
    ? `<p style="margin:18px 0 6px;font-weight:bold;">On Google</p>
      <table style="border-collapse:collapse;margin:0 0 6px;">${[
        row("Times your site showed in Google searches", g.impressions.toLocaleString("en-GB")),
        row("Clicks through to your site", g.clicks.toLocaleString("en-GB")),
        g.position > 0 ? row("Average position in the results", String(g.position)) : "",
      ].join("")}</table>${
        g.topQueries.length
          ? `<p style="color:#56534a;margin:4px 0;">Searches that brought people in: ${g.topQueries
              .map((q) => `&ldquo;${escapeHtml(q.query)}&rdquo; (${q.clicks})`)
              .join(", ")}</p>`
          : ""
      }<p style="color:#6b6255;font-size:12px;margin:4px 0;">Google's own figures, from Search Console.</p>`
    : "";
  const gr = s.growth;
  const growth = gr
    ? `<p style="margin:18px 0 6px;font-weight:bold;">Growing your local search</p>
      <table style="border-collapse:collapse;margin:0 0 6px;">${[
        row("New pages about your finished jobs", String(gr.pagesPublished)),
        row("Job pages on your site now", String(gr.pagesLive)),
        row("Visits to your job pages", String(gr.pageVisits)),
        gr.pageTaps ? row("Calls and WhatsApps from job pages", String(gr.pageTaps)) : "",
      ].join("")}</table>${
        gr.waiting
          ? `<p style="color:#56534a;margin:4px 0;">${gr.waiting} more ${gr.waiting === 1 ? "is" : "are"} written and waiting for your OK - <a href="${dashboardUrl.replace(/\/dashboard$/, "/posts")}">approve ${gr.waiting === 1 ? "it" : "them"}</a>.</p>`
          : gr.pagesPublished === 0
            ? `<p style="color:#56534a;margin:4px 0;">No new pages this month - add photos to your jobs before marking them complete and they're written up for you.</p>`
            : ""
      }`
    : "";
  return {
    subject: `${monthLabel} for ${businessName}: ${s.enquiries} enquir${s.enquiries === 1 ? "y" : "ies"}${
      s.quotesWon > 0 ? `, ${formatGBP(s.wonPence)} won` : ""
    }`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;max-width:520px;">
      <p>Here's how ${escapeHtml(businessName)}'s website and dashboard did in ${escapeHtml(monthLabel)}:</p>
      <table style="border-collapse:collapse;margin:12px 0;">${rows}</table>${google}${growth}${gr ? "" : growthPitch(s.jobsWithPhotos ?? 0)}
      <p><a href="${dashboardUrl}">Open your dashboard</a> for the detail.</p>
      <p style="color:#6b6255;font-size:13px;">Anything you'd like changed on the site? Use Website help in your dashboard, or just reply.</p>
      <p>Scalar Digital</p>
    </div>`,
  };
}

export async function sendMonthlyReports(now = new Date()): Promise<{ sent: number }> {
  const today = todayInUK(now);
  if (!today.endsWith("-01")) return { sent: 0 };
  const { from, to, label } = previousMonth(today);
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, domain, slug, contact_email, launched_on, plan")
    .not("launched_on", "is", null)
    .neq("slug", DEMO_SLUG);

  let sent = 0;
  for (const t of tenants ?? []) {
    try {
      const between = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(q: T, column: string) =>
        q.gte(column, `${from}T00:00:00Z`).lt(column, `${to}T00:00:00Z`);
      const count = { count: "exact" as const, head: true };
      const [visits, taps, enquiries, sentQuotes, won, reviews] = await Promise.all([
        between(admin.from("pageviews").select("id", count).eq("tenant_id", t.id).is("kind", null), "created_at"),
        admin
          .from("pageviews")
          .select("kind")
          .eq("tenant_id", t.id)
          .not("kind", "is", null)
          .gte("created_at", `${from}T00:00:00Z`)
          .lt("created_at", `${to}T00:00:00Z`)
          .limit(10000),
        between(admin.from("leads").select("id", count).eq("tenant_id", t.id), "created_at"),
        between(admin.from("quotes").select("id", count).eq("tenant_id", t.id), "sent_at"),
        between(admin.from("quotes").select("total_pence").eq("tenant_id", t.id), "accepted_at"),
        between(admin.from("reviews").select("id", count).eq("tenant_id", t.id), "received_at"),
      ]);
      const onGrowth = planIncludes(t.plan, "seo_pages");
      const growth = onGrowth ? await growthStats(admin, t.id, from, to).catch(() => null) : null;
      const jobsWithPhotos = onGrowth ? 0 : await finishedJobsWithPhotos(admin, t.id, `${from}T00:00:00Z`, `${to}T00:00:00Z`).catch(() => 0);
      const email = monthlyReportEmail(
        t.business_name,
        label,
        {
          visits: visits.count ?? 0,
          callTaps: tapCounts(taps.data ?? []).call,
          whatsappTaps: tapCounts(taps.data ?? []).whatsapp,
          enquiries: enquiries.count ?? 0,
          quotesSent: sentQuotes.count ?? 0,
          quotesWon: (won.data ?? []).length,
          wonPence: (won.data ?? []).reduce((sum, q) => sum + (q.total_pence ?? 0), 0),
          reviews: reviews.count ?? 0,
          search: t.domain ? await searchStats(t.domain, from, to).catch(() => null) : null,
          growth,
          jobsWithPhotos,
        },
        `${tenantOrigin(t)}/dashboard`
      );
      if (!email) continue;
      const recipients = await businessRecipients(admin, t.id, t.contact_email);
      if (recipients.length === 0) continue;
      await sendEmail({ to: recipients, ...email, replyTo: "hello@scalardigital.co.uk" });
      sent++;
    } catch (err) {
      console.error(`Monthly report failed for tenant ${t.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { sent };
}

async function growthStats(admin: ReturnType<typeof createAdminClient>, tenantId: string, from: string, to: string): Promise<GrowthStats | null> {
  const { data: posts, error } = await admin.from("job_posts").select("status, published_at").eq("tenant_id", tenantId);
  if (error) return null;
  const { data: views } = await admin
    .from("pageviews")
    .select("path, kind")
    .eq("tenant_id", tenantId)
    .like("path", "/work/%")
    .gte("created_at", `${from}T00:00:00Z`)
    .lt("created_at", `${to}T00:00:00Z`)
    .limit(20000);
  const counts = jobPageCounts(views ?? []);
  const live = (posts ?? []).filter((p) => p.status === "published");
  return {
    pagesPublished: live.filter((p) => p.published_at && p.published_at >= `${from}T00:00:00Z` && p.published_at < `${to}T00:00:00Z`).length,
    pagesLive: live.length,
    pageVisits: counts.visits,
    pageTaps: counts.taps,
    waiting: (posts ?? []).filter((p) => p.status === "draft").length,
  };
}

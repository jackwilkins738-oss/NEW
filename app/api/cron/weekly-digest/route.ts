import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAlerts, type Alert } from "@/lib/alerts";
import { computeProjectRisks } from "@/lib/projectRisk";
import { computeScheduleConflicts } from "@/lib/scheduleConflicts";
import { computePortfolioForecast } from "@/lib/portfolioForecast";
import { computeReceivablesAging } from "@/lib/receivablesAging";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { deriveBrandTheme } from "@/lib/theme";

const SEVERITY_COLOR: Record<Alert["severity"], string> = {
  critical: "#d03b3b",
  warning: "#8a5a00",
  info: "#56534a",
};

// Vercel's own recommended pattern for a cron-only route: set CRON_SECRET
// in the project's env vars and Vercel sends it as this header on every
// scheduled invocation automatically - nothing else to configure. See
// vercel.json for the schedule (Monday 08:00 UTC).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, slug, domain, brand_theme");

  if (!tenants) return NextResponse.json({ ok: true, sent: 0 });

  let sent = 0;
  for (const tenant of tenants) {
    try {
      const sentToTenant = await sendDigestForTenant(admin, tenant);
      if (sentToTenant) sent++;
    } catch (err) {
      console.error(`Weekly digest failed for tenant ${tenant.id}:`, err);
      Sentry.captureException(err);
    }
  }

  return NextResponse.json({ ok: true, sent, tenants: tenants.length });
}

async function sendDigestForTenant(
  admin: ReturnType<typeof createAdminClient>,
  tenant: { id: string; business_name: string; slug: string; domain: string | null; brand_theme: string }
): Promise<boolean> {
  const [leadsRes, invoicesRes, projectsRes, quotesRes, variationsRes, costItemsRes, reviewsRes, teamAssignmentsRes] =
    await Promise.all([
      admin.from("leads").select("id, name, email, status, created_at").eq("tenant_id", tenant.id),
      admin
        .from("invoices")
        .select("id, client_name, amount_pence, paid_pence, due_date, status, project_id")
        .eq("tenant_id", tenant.id),
      admin
        .from("projects")
        .select("id, client_name, start_date, target_date, next_visit_at, status, quote_id, value_pence, completed_at")
        .eq("tenant_id", tenant.id),
      admin
        .from("quotes")
        .select("id, client_name, quote_number, status, sent_at, line_items")
        .eq("tenant_id", tenant.id),
      admin
        .from("variations")
        .select("id, number, project_id, status, customer_price_pence")
        .eq("tenant_id", tenant.id)
        .eq("status", "pending"),
      admin.from("project_cost_items").select("project_id, amount_pence").eq("tenant_id", tenant.id),
      admin
        .from("reviews")
        .select("id, customer_name, project_id, status")
        .eq("tenant_id", tenant.id)
        .eq("status", "requested"),
      admin
        .from("project_team_members")
        .select("project_id, team_member_id, team_members!inner(id, name, tenant_id)")
        .eq("team_members.tenant_id", tenant.id),
    ]);

  const projects = projectsRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const committedByProject = new Map<string, number>();
  for (const item of costItemsRes.data ?? []) {
    committedByProject.set(item.project_id, (committedByProject.get(item.project_id) ?? 0) + item.amount_pence);
  }
  const projectBudgets = projects
    .filter((p) => p.quote_id)
    .map((p) => {
      const quote = quoteById.get(p.quote_id!);
      const lineItems = (quote?.line_items ?? []) as { unit_price_pence: number }[];
      const budgetPence = lineItems.reduce((sum, l) => sum + l.unit_price_pence, 0);
      return {
        project_id: p.id,
        client_name: p.client_name,
        budget_pence: budgetPence,
        committed_pence: committedByProject.get(p.id) ?? 0,
      };
    });

  const projectNameById = new Map(projects.map((p) => [p.id, p.client_name]));
  const variationAlerts = (variationsRes.data ?? []).map((v) => ({
    id: v.id,
    number: v.number,
    project_client_name: projectNameById.get(v.project_id) ?? "a project",
    status: v.status,
  }));

  const reviewAlerts = (reviewsRes.data ?? []).map((r) => ({
    id: r.id,
    customer_name: r.customer_name,
    project_client_name: r.project_id ? projectNameById.get(r.project_id) ?? "a project" : "a project",
    status: r.status,
  }));

  const scheduleConflicts = computeScheduleConflicts(
    (teamAssignmentsRes.data ?? []).map((a) => ({
      projectId: a.project_id,
      teamMemberId: a.team_member_id,
      teamMemberName: (a.team_members as unknown as { name: string })?.name ?? "Someone",
    })),
    projects.map((p) => ({
      id: p.id,
      client_name: p.client_name,
      start_date: p.start_date,
      target_date: p.target_date,
      completed_at: p.completed_at,
    }))
  );

  const alerts = buildAlerts(
    leadsRes.data ?? [],
    invoicesRes.data ?? [],
    projects,
    quotes,
    variationAlerts,
    projectBudgets,
    reviewAlerts,
    scheduleConflicts
  );
  // A "nothing to report" email every Monday is noise, not help - only
  // send when there's actually something worth a tenant's attention.
  if (alerts.length === 0) return false;

  // Same pure functions the dashboard's own "Projects at risk", forecast
  // margin and receivables ageing cards use - a compact snapshot instead
  // of duplicating that logic, so the email can never say something
  // different from what the dashboard itself shows.
  const invoices = invoicesRes.data ?? [];
  const jobRisks = computeProjectRisks(
    projects.map((p) => ({ id: p.id, client_name: p.client_name, status: p.status, target_date: p.target_date, completed_at: p.completed_at })),
    invoices,
    (variationsRes.data ?? []).map((v) => ({ project_id: v.project_id, customer_price_pence: v.customer_price_pence, status: v.status, number: v.number })),
    projectBudgets
  );
  const forecast = computePortfolioForecast(
    projects.map((p) => ({ id: p.id, value_pence: p.value_pence, completed_at: p.completed_at })),
    costItemsRes.data ?? []
  );
  const aging = computeReceivablesAging(invoices);
  const totalRiskExposure = jobRisks.reduce((sum, r) => sum + r.financialImpactPence, 0);

  const { data: memberships } = await admin.from("memberships").select("user_id").eq("tenant_id", tenant.id);
  if (!memberships || memberships.length === 0) return false;

  const emails: string[] = [];
  for (const m of memberships) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return false;

  const dashboardUrl = `https://${tenant.domain || `${tenant.slug}.scalardigital.co.uk`}/dashboard`;
  const brandColor = deriveBrandTheme(tenant.brand_theme).light.brand;

  const rows = alerts
    .map(
      (a) =>
        `<li style="margin-bottom:8px;color:${SEVERITY_COLOR[a.severity]};"><span style="color:#17140f;">${a.text}</span></li>`
    )
    .join("");

  const snapshotCells = [
    jobRisks.length > 0 ? `<strong>${jobRisks.length}</strong> project${jobRisks.length === 1 ? "" : "s"} at risk (${formatGBP(totalRiskExposure)} exposed)` : null,
    forecast.forecastMarginPercent != null ? `<strong>${forecast.forecastMarginPercent.toFixed(1)}%</strong> forecast margin` : null,
    aging.totalOutstandingPence > 0 ? `<strong>${formatGBP(aging.totalOutstandingPence)}</strong> outstanding` : null,
  ].filter((c): c is string => c != null);
  const snapshot =
    snapshotCells.length > 0
      ? `<p style="margin:14px 0;padding:12px 14px;background:#f4f1ea;border-radius:8px;font-size:14px;">${snapshotCells.join(" &middot; ")}</p>`
      : "";

  await sendEmail({
    to: emails,
    subject: `This week: ${alerts.length} thing${alerts.length === 1 ? "" : "s"} need${alerts.length === 1 ? "s" : ""} attention`,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
        <p style="font-size:16px;">Your Monday check-in for <strong>${tenant.business_name}</strong>:</p>
        ${snapshot}
        <ul style="padding-left:18px;">${rows}</ul>
        <p style="margin-top:20px;">
          <a href="${dashboardUrl}" style="background:${brandColor};color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">Open your dashboard</a>
        </p>
      </div>
    `,
  });

  return true;
}

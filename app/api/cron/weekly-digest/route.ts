import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAlerts, type Alert } from "@/lib/alerts";
import { sendEmail } from "@/lib/email";
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
  const [leadsRes, invoicesRes, projectsRes] = await Promise.all([
    admin.from("leads").select("id, name, email, status, created_at").eq("tenant_id", tenant.id),
    admin.from("invoices").select("id, client_name, amount_pence, due_date, status").eq("tenant_id", tenant.id),
    admin.from("projects").select("id, client_name, target_date, next_visit_at, status").eq("tenant_id", tenant.id),
  ]);

  const alerts = buildAlerts(leadsRes.data ?? [], invoicesRes.data ?? [], projectsRes.data ?? []);
  // A "nothing to report" email every Monday is noise, not help - only
  // send when there's actually something worth a tenant's attention.
  if (alerts.length === 0) return false;

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

  await sendEmail({
    to: emails,
    subject: `This week: ${alerts.length} thing${alerts.length === 1 ? "" : "s"} need${alerts.length === 1 ? "s" : ""} attention`,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
        <p style="font-size:16px;">Your Monday check-in for <strong>${tenant.business_name}</strong>:</p>
        <ul style="padding-left:18px;">${rows}</ul>
        <p style="margin-top:20px;">
          <a href="${dashboardUrl}" style="background:${brandColor};color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">Open your dashboard</a>
        </p>
      </div>
    `,
  });

  return true;
}

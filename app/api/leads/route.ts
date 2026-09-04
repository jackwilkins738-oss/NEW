import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Leads used to be written straight from the customer's browser to
// Supabase's REST API - which meant there was no code of ours in that path
// to hook a notification email into. Routing it through this endpoint
// instead: the insert itself works the same way (site_key still has to
// match the tenant, same trust model as the RLS policy it replaces - this
// uses the service-role client since there's no signed-in user here to
// carry an RLS identity, so that check is done explicitly below instead),
// and a notification email fires right after a successful insert.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const tenantId = String(body.tenant_id ?? "");
  const siteKey = String(body.site_key ?? "");
  if (!tenantId || !siteKey) {
    return NextResponse.json({ error: "Missing tenant_id or site_key" }, { status: 400, headers: CORS_HEADERS });
  }

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, business_name, site_key, domain, slug")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant || tenant.site_key !== siteKey) {
    // Deliberately vague - this endpoint is public, no reason to help
    // someone probing it figure out whether a tenant id is valid.
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  // Vercel sets x-forwarded-for on every request; take the first hop (the
  // actual client, not any proxy in front of them).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  if (ip) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("ip", ip)
      .gte("created_at", tenMinutesAgo);

    if ((count ?? 0) >= 5) {
      // Same vague 404 as an invalid site_key - no reason to tell a bot
      // it's specifically been rate-limited rather than rejected outright.
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
    }
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      tenant_id: tenantId,
      site_key: siteKey,
      name: body.name ? String(body.name) : null,
      email: body.email ? String(body.email) : null,
      phone: body.phone ? String(body.phone) : null,
      message: body.message ? String(body.message) : null,
      source: body.source ? String(body.source) : null,
      ip,
    })
    .select("id")
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "Could not save lead" }, { status: 500, headers: CORS_HEADERS });
  }

  // Notification is best-effort: a failure here shouldn't make the lead
  // capture itself look like it failed to whoever's site just submitted it.
  notifyNewLead(admin, tenant, {
    name: body.name ? String(body.name) : null,
    email: body.email ? String(body.email) : null,
    source: body.source ? String(body.source) : null,
  }).catch((err) => console.error("Lead notification failed:", err));

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

async function notifyNewLead(
  admin: ReturnType<typeof createAdminClient>,
  tenant: { id: string; business_name: string; domain: string | null; slug: string },
  lead: { name: string | null; email: string | null; source: string | null }
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const { data: memberships } = await admin.from("memberships").select("user_id").eq("tenant_id", tenant.id);
  if (!memberships || memberships.length === 0) return;

  const emails: string[] = [];
  for (const m of memberships) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return;

  const dashboardUrl = `https://${tenant.domain || `${tenant.slug}.scalardigital.co.uk`}/dashboard`;
  const who = lead.name || lead.email || "Someone";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Scalar Digital <notify@scalardigital.help>",
      to: emails,
      subject: `New lead: ${who}`,
      html: `
        <div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
          <p style="font-size:16px;"><strong>${who}</strong> just enquired via ${tenant.business_name}'s website${
        lead.source ? ` (${lead.source})` : ""
      }.</p>
          ${lead.email ? `<p>Email: ${lead.email}</p>` : ""}
          <p style="margin-top:20px;">
            <a href="${dashboardUrl}" style="background:#8b4a2b;color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">View on your dashboard</a>
          </p>
        </div>
      `,
    }),
  });
}

import { NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveBrandTheme } from "@/lib/theme";
import { sendEmail } from "@/lib/email";

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
    .select("id, business_name, site_key, domain, slug, brand_theme, contact_email")
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

  // Both best-effort: a failure here shouldn't make the lead capture itself
  // look like it failed to whoever's site just submitted it. Run with after()
  // rather than left floating: on Vercel a promise still running when the
  // response goes out can be frozen with the function, and the owner's alert
  // (or the enquirer's auto-reply) silently never sends.
  const leadDetails = {
    name: body.name ? String(body.name) : null,
    email: body.email ? String(body.email) : null,
    phone: body.phone ? String(body.phone) : null,
    message: body.message ? String(body.message) : null,
    source: body.source ? String(body.source) : null,
  };
  after(async () => {
    await notifyNewLead(admin, tenant, leadDetails).catch((err) => {
      console.error("Lead notification failed:", err);
      Sentry.captureException(err);
    });
    if (body.email) {
      await sendLeadAutoReply(tenant, String(body.name ?? ""), String(body.email)).catch((err) => {
        console.error("Lead auto-reply failed:", err);
        Sentry.captureException(err);
      });
    }
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

// Missed-lead protection: the enquirer gets an immediate, real reply the
// moment they submit - not left wondering if the form even worked, and not
// waiting for whoever runs the business to notice the notification email.
// The site itself already tells visitors "the average business takes 42
// hours to reply... every site I build gets your enquiries to you within
// 2 hours" - this is what actually makes that true from the enquirer's side,
// not just faster on the owner's side.
async function sendLeadAutoReply(
  tenant: { business_name: string; contact_email?: string | null },
  name: string,
  email: string
) {
  const firstName = name.trim().split(/\s+/)[0] || null;

  await sendEmail({
    to: [email],
    subject: `Thanks for getting in touch with ${tenant.business_name}`,
    html: `
      <p>Hi${firstName ? ` ${firstName}` : ""},</p>
      <p>Thanks for reaching out to ${tenant.business_name} - we've received your enquiry and someone will be in touch shortly.</p>
      <p>If it's urgent, feel free to reply directly to this email.</p>
    `,
    replyTo: tenant.contact_email ?? undefined,
  });
}

// Tells the business straight away, with everything they need to reply from
// their phone - name, a tap-to-call number, email and the message itself -
// so a tradesperson on a roof doesn't have to log in to act on it. Goes to
// everyone with a dashboard login and to the business's contact email; for a
// landing-page client with no login, the contact email is the whole alert.
async function notifyNewLead(
  admin: ReturnType<typeof createAdminClient>,
  tenant: { id: string; business_name: string; domain: string | null; slug: string; brand_theme: string; contact_email?: string | null },
  lead: { name: string | null; email: string | null; phone: string | null; message: string | null; source: string | null }
) {
  const { data: memberships } = await admin.from("memberships").select("user_id").eq("tenant_id", tenant.id);
  const emails = new Set<string>();
  for (const m of memberships ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.add(data.user.email.toLowerCase());
  }
  if (tenant.contact_email) emails.add(tenant.contact_email.toLowerCase());
  if (emails.size === 0) return;

  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const dashboardUrl = `https://${tenant.domain || `${tenant.slug}.scalardigital.co.uk`}/dashboard`;
  const who = lead.name || lead.email || lead.phone || "Someone";
  const brandColor = deriveBrandTheme(tenant.brand_theme).light.brand;
  const tel = (lead.phone ?? "").replace(/[^\d+]/g, "");
  const button = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;background:${brandColor};color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">${label}</a>`;

  await sendEmail({
    to: [...emails],
    subject: `New enquiry: ${who}`,
    replyTo: lead.email ?? undefined,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
        <p style="font-size:16px;"><strong>${esc(who)}</strong> just enquired via ${esc(tenant.business_name)}'s website${
      lead.source ? ` (${esc(lead.source)})` : ""
    }.</p>
        ${lead.phone ? `<p>Phone: <a href="tel:${esc(tel)}">${esc(lead.phone)}</a></p>` : ""}
        ${lead.email ? `<p>Email: ${esc(lead.email)}</p>` : ""}
        ${lead.message ? `<p style="white-space:pre-line;border-left:3px solid ${brandColor};padding-left:12px;">${esc(lead.message.slice(0, 2000))}</p>` : ""}
        <p style="margin-top:20px;">
          ${tel ? button(`tel:${esc(tel)}`, "Call them now") : ""}
          ${memberships && memberships.length > 0 ? button(dashboardUrl, "View on your dashboard") : ""}
        </p>
        <p style="color:#6b6255;font-size:13px;">Reply to this email to answer them directly. People who hear back within the hour are far more likely to book.</p>
      </div>
    `,
  });
}

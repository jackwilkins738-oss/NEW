import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";
import { computeQuoteTotals, parseLineItems } from "@/lib/quoteMath";
import { parseExtras } from "@/lib/quoteExtras";
import { randomBytes } from "node:crypto";

// "They're interested - send them a quote." Called by the owner's local
// control panel (never a browser), behind the same service secret as the
// prospect import. In one step it records the prospect as a lead (status
// "quoted"), creates a numbered quote linked to it and marks it sent, and
// moves the prospect to "replied". Nothing is emailed from here: the panel
// hands the owner the quote link to send personally.
//
// The terms travel with the quote - the customer signs "including its terms",
// so a quote with none would bind them to nothing. The panel sends Scalar's
// terms of business; if it doesn't, the tenant's saved defaults are used.
//
// The link is built on this app's own origin - the quote pages live here -
// rather than the tenant's domain.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOTAL_PENCE = 10_000_000; // £100k - anything above is a typo

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(request: Request) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = typeof body.tenant_id === "string" && UUID.test(body.tenant_id) ? body.tenant_id : "";
  const clientName = text(body.client_name, 120);
  if (!tenantId || !clientName) {
    return NextResponse.json({ error: "Expected tenant_id and client_name" }, { status: 400 });
  }
  const email = text(body.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const phone = text(body.phone, 40);
  const lineItems = parseLineItems(JSON.stringify(body.line_items ?? []));
  if (lineItems.length === 0 || lineItems.length > 10) {
    return NextResponse.json({ error: "Expected 1-10 line_items" }, { status: 400 });
  }
  const vatRate = body.vat_rate === 20 ? 20 : 0;
  const { costSubtotalPence, vatAmountPence, totalPence } = computeQuoteTotals(lineItems, 0, vatRate);
  if (totalPence <= 0 || totalPence > MAX_TOTAL_PENCE) {
    return NextResponse.json({ error: "Total out of range" }, { status: 400 });
  }
  const depositPercent = typeof body.deposit_percent === "number" && body.deposit_percent > 0 && body.deposit_percent <= 100
    ? body.deposit_percent : 0;
  const expiresDays = typeof body.expires_days === "number" && body.expires_days >= 1 && body.expires_days <= 90
    ? Math.round(body.expires_days) : 30;
  const slug = typeof body.slug === "string" && isValidProspectSlug(body.slug) ? body.slug : null;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, site_key, quote_number_prefix, default_quote_terms, default_payment_terms")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      tenant_id: tenantId,
      site_key: tenant.site_key,
      name: clientName,
      email,
      phone,
      source: "outreach",
      status: "quoted",
      value_pence: totalPence,
      notes: text(body.note, 1000),
    })
    .select("id")
    .single();
  if (leadError || !lead) return NextResponse.json({ error: "Could not save the lead" }, { status: 500 });

  const { data: n } = await admin.rpc("increment_quote_number", { p_tenant_id: tenantId });
  const quoteNumber = `${tenant.quote_number_prefix ?? "Q"}-${String(n ?? 1).padStart(4, "0")}`;
  const now = new Date();
  const expires = new Date(now.getTime() + expiresDays * 86_400_000).toISOString().slice(0, 10);

  const { data: quote, error: quoteError } = await admin
    .from("quotes")
    .insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      quote_number: quoteNumber,
      client_name: clientName,
      reference: text(body.reference, 120),
      customer_email: email,
      customer_phone: phone,
      expires_at: expires,
      payment_terms: text(body.payment_terms, 500) ?? tenant.default_payment_terms ?? null,
      exclusions: text(body.exclusions, 2000),
      terms: text(body.terms, 10_000) ?? tenant.default_quote_terms ?? null,
      markup_percent: 0,
      vat_rate: vatRate,
      line_items: lineItems,
      cost_subtotal_pence: costSubtotalPence,
      vat_amount_pence: vatAmountPence,
      total_pence: totalPence,
      deposit_pence: depositPercent ? Math.round((totalPence * depositPercent) / 100) : null,
      status: "sent",
      sent_at: now.toISOString(),
    })
    .select("id, accept_token")
    .single();
  if (quoteError || !quote) return NextResponse.json({ error: "Could not save the quote" }, { status: 500 });

  // Optional extras the client can tick before signing (migration 058). Saved
  // on their own so a database without the migration still gets the quote.
  const extras = parseExtras(body.optional_items);
  if (extras.length) await admin.from("quotes").update({ optional_items: extras }).eq("id", quote.id);

  // Their private onboarding page, offered once they accept (app/quote/actions.ts).
  const onboardingToken = randomBytes(24).toString("base64url");
  await admin.from("onboarding").insert({
    tenant_id: tenantId,
    quote_id: quote.id,
    token: onboardingToken,
    client_name: clientName,
    prospect_slug: slug,
  });

  if (slug) {
    await admin
      .from("prospects")
      .update({ status: "replied", updated_at: now.toISOString() })
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .in("status", ["new", "contacted", "viewed"]);
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    quote_number: quoteNumber,
    total_pence: totalPence,
    quote_url: `${origin}/quote/${quote.id}/${quote.accept_token}`,
  });
}

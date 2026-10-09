import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/stripe";
import { logAudit } from "@/lib/auditLog";
import { formatGBP } from "@/lib/format";
import { billingStatusFor, PLANS, planOf } from "@/lib/billing";

// Registered once in the Stripe dashboard (platform account, with "listen
// to events on Connected accounts" turned on) pointing at this URL. The raw
// request body has to be read as text, not parsed as JSON, before
// signature verification - JSON.parse -> JSON.stringify would not
// reproduce the exact bytes Stripe signed.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !signature || !verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // The dashboard fee (lib/billing.ts) - events on Scalar's own Stripe account.
    if (event.type === "checkout.session.completed" && (event.data.object as { mode?: string }).mode === "subscription") {
      const session = event.data.object as { subscription?: string; metadata?: { billing_tenant_id?: string; billing_plan?: string } };
      const tenantId = session.metadata?.billing_tenant_id;
      if (tenantId && session.subscription) {
        const admin = createAdminClient();
        await admin
          .from("tenants")
          .update({
            stripe_subscription_id: session.subscription,
            // Care waits out the free period; Growth and Pro bill from the start.
            billing_status: planOf(session.metadata?.billing_plan) === "care" ? "trialing" : "active",
          })
          .eq("id", tenantId);
        // Separate update so a card still lands before migration 064 adds the plan column.
        if (session.metadata?.billing_plan) {
          await admin.from("tenants").update({ plan: planOf(session.metadata.billing_plan) }).eq("id", tenantId);
        }
        await logAudit({
          tenantId,
          action: "billing.card_added",
          entityType: "tenant",
          entityId: tenantId,
          summary: `Card added for the ${PLANS[planOf(session.metadata?.billing_plan)].name} plan`,
        });
      }
    }
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as { id?: string; status?: string; metadata?: { billing_tenant_id?: string } };
      if (sub.id && sub.metadata?.billing_tenant_id) {
        await createAdminClient()
          .from("tenants")
          .update({ billing_status: event.type === "customer.subscription.deleted" ? "cancelled" : billingStatusFor(sub.status ?? "") })
          .eq("id", sub.metadata.billing_tenant_id)
          .eq("stripe_subscription_id", sub.id);
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata?: { invoice_id?: string } };
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId) {
        const admin = createAdminClient();
        const { data: invoice } = await admin
          .from("invoices")
          .select("amount_pence, project_id, tenant_id, status, client_name")
          .eq("id", invoiceId)
          .maybeSingle();
        // Stripe can redeliver the same event (their documented at-least-
        // once guarantee) - skip work entirely once this invoice is
        // already marked paid, so a replay can't leave a second identical
        // "Invoice paid" note in the project's communications log.
        if (invoice && invoice.status !== "paid") {
          await admin.from("invoices").update({ status: "paid", paid_pence: invoice.amount_pence }).eq("id", invoiceId);
          if (invoice.project_id) {
            await admin.from("communications").insert({
              tenant_id: invoice.tenant_id,
              project_id: invoice.project_id,
              type: "note",
              summary: "Invoice paid online via Stripe",
            });
          }
          await logAudit({
            tenantId: invoice.tenant_id,
            action: "invoice.paid_online",
            entityType: "invoice",
            entityId: invoiceId,
            summary: `${invoice.client_name} paid their invoice online via Stripe (${formatGBP(invoice.amount_pence)})`,
          });
        }
      }
    }
  } catch (err) {
    console.error("Stripe webhook handling failed:", err);
    Sentry.captureException(err);
  }

  return NextResponse.json({ received: true });
}

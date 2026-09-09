import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/stripe";

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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata?: { invoice_id?: string } };
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId) {
        const admin = createAdminClient();
        const { data: invoice } = await admin
          .from("invoices")
          .select("amount_pence, project_id, tenant_id, status")
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
        }
      }
    }
  } catch (err) {
    console.error("Stripe webhook handling failed:", err);
    Sentry.captureException(err);
  }

  return NextResponse.json({ received: true });
}

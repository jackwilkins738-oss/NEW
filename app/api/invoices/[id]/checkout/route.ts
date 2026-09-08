import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutSession } from "@/lib/stripe";

// Public - the customer clicks "Pay now" on the public invoice page, which
// posts here with the same view_token that page itself was reached with.
// Creates a fresh Checkout Session every click rather than a stored link,
// so the amount always reflects the current outstanding balance (a part-
// payment recorded by hand since the page loaded, say).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, tenant_id, invoice_number, amount_pence, paid_pence, status, view_token")
    .eq("id", params.id)
    .maybeSingle();
  if (!invoice || invoice.view_token !== token) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "paid") return NextResponse.json({ error: "This invoice is already paid" }, { status: 400 });

  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_account_id, business_name")
    .eq("id", invoice.tenant_id)
    .maybeSingle();
  if (!tenant?.stripe_account_id) {
    return NextResponse.json({ error: "Online payment isn't set up for this business yet" }, { status: 400 });
  }

  const outstanding = invoice.amount_pence - (invoice.paid_pence ?? 0);
  if (outstanding <= 0) return NextResponse.json({ error: "Nothing outstanding on this invoice" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/invoice/${invoice.id}/${invoice.view_token}`;

  try {
    const session = await createCheckoutSession(tenant.stripe_account_id, {
      amountPence: outstanding,
      description: `Invoice ${invoice.invoice_number ?? invoice.id} - ${tenant.business_name}`,
      successUrl: `${returnUrl}?paid=1`,
      cancelUrl: returnUrl,
      metadata: { invoice_id: invoice.id },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json({ error: "Could not start payment - try again shortly" }, { status: 500 });
  }
}

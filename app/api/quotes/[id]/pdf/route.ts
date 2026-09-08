import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuotePdfDocument, type QuotePdfData } from "@/lib/quotePdf";

const SELECT =
  "id, tenant_id, quote_number, client_name, line_items, markup_percent, vat_rate, vat_amount_pence, total_pence, expires_at, deposit_pence, payment_terms, exclusions, terms, accept_token";

// Two ways in: a signed-in owner (RLS on the session-scoped client
// naturally restricts this to their own tenant's quotes, same as every
// other authenticated read), or a customer following a quote link with its
// ?token= - checked by hand against accept_token via the service-role
// client, same trust model as the public quote page itself.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = new URL(request.url).searchParams.get("token");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  let quote;
  if (userData.user) {
    const { data } = await supabase.from("quotes").select(SELECT).eq("id", params.id).maybeSingle();
    quote = data;
  }
  if (!quote && token) {
    const admin = createAdminClient();
    const { data } = await admin.from("quotes").select(SELECT).eq("id", params.id).maybeSingle();
    if (data && data.accept_token === token) quote = data;
  }
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("business_name").eq("id", quote.tenant_id).maybeSingle();

  const pdfData: QuotePdfData = {
    businessName: tenant?.business_name ?? "Your contractor",
    quoteNumber: quote.quote_number,
    clientName: quote.client_name,
    lineItems: quote.line_items,
    markupPercent: quote.markup_percent,
    vatRate: quote.vat_rate,
    vatAmountPence: quote.vat_amount_pence,
    totalPence: quote.total_pence,
    expiresAt: quote.expires_at,
    depositPence: quote.deposit_pence,
    paymentTerms: quote.payment_terms,
    exclusions: quote.exclusions,
    terms: quote.terms,
  };

  // react-pdf's own type for renderToBuffer wants an element typed to its
  // internal DocumentProps specifically - QuotePdfDocument does render a
  // <Document> at its root, this cast just tells TS what we already know.
  const buffer = await renderToBuffer(createElement(QuotePdfDocument, { data: pdfData }) as Parameters<typeof renderToBuffer>[0]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quote-${quote.quote_number ?? quote.id}.pdf"`,
    },
  });
}

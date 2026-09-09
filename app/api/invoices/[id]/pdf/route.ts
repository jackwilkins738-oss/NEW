import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvoicePdfDocument, type InvoicePdfData } from "@/lib/invoicePdf";
import { deriveBrandTheme } from "@/lib/theme";

const SELECT = "id, tenant_id, invoice_number, reference, milestone, client_name, amount_pence, paid_pence, due_date, status, view_token";

// Same two-ways-in pattern as the quote PDF route: a signed-in owner (RLS
// scopes this to their own tenant), or a customer following an emailed
// link with its ?token= - checked against view_token via the service-role
// client.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = new URL(request.url).searchParams.get("token");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  let invoice;
  if (userData.user) {
    const { data } = await supabase.from("invoices").select(SELECT).eq("id", params.id).maybeSingle();
    invoice = data;
  }
  if (!invoice && token) {
    const admin = createAdminClient();
    const { data } = await admin.from("invoices").select(SELECT).eq("id", params.id).maybeSingle();
    if (data && data.view_token === token) invoice = data;
  }
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("business_name, company_address, vat_number, bank_details, logo_url, brand_theme")
    .eq("id", invoice.tenant_id)
    .maybeSingle();

  const pdfData: InvoicePdfData = {
    businessName: tenant?.business_name ?? "Your contractor",
    companyAddress: tenant?.company_address ?? null,
    vatNumber: tenant?.vat_number ?? null,
    bankDetails: tenant?.bank_details ?? null,
    logoUrl: tenant?.logo_url ?? null,
    brandColor: deriveBrandTheme(tenant?.brand_theme ?? "rust").light.brand,
    invoiceNumber: invoice.invoice_number,
    reference: invoice.reference,
    milestone: invoice.milestone,
    clientName: invoice.client_name,
    amountPence: invoice.amount_pence,
    paidPence: invoice.paid_pence ?? 0,
    dueDate: invoice.due_date,
    status: invoice.status,
  };

  const buffer = await renderToBuffer(createElement(InvoicePdfDocument, { data: pdfData }) as Parameters<typeof renderToBuffer>[0]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.invoice_number ?? invoice.id}.pdf"`,
    },
  });
}

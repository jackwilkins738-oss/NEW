import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { initialsFor } from "@/lib/initials";
import { PayInvoiceButton } from "@/app/invoice/PayInvoiceButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Partially paid",
  paid: "Paid",
};

// No auth - view_token in the URL (an unguessable uuid, same idea as
// tenants.site_key / quotes.accept_token) is what proves the visitor is
// the intended recipient. Wrong id/token -> 404, same as a non-existent
// invoice, so this doesn't leak whether an invoice id is real.
export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string; token: string };
  searchParams: { paid?: string };
}) {
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, tenant_id, invoice_number, reference, milestone, client_name, amount_pence, paid_pence, due_date, status, view_token")
    .eq("id", params.id)
    .maybeSingle();

  if (!invoice || invoice.view_token !== params.token) notFound();

  const { data: tenant } = await admin
    .from("tenants")
    .select("business_name, brand_theme, bank_details, contact_email, stripe_account_id, logo_url")
    .eq("id", invoice.tenant_id)
    .maybeSingle();

  const outstanding = invoice.amount_pence - (invoice.paid_pence ?? 0);
  const overdue = invoice.status !== "paid" && new Date(invoice.due_date + "T00:00:00") < new Date();
  const businessName = tenant?.business_name ?? "Your contractor";
  const canPayOnline = invoice.status !== "paid" && outstanding > 0 && tenant?.stripe_account_id;

  return (
    <main className="min-h-screen bg-page px-5 py-10 sm:py-14">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant?.brand_theme ?? "rust") }} />
      <div className="mx-auto max-w-xl">
        {/* Letterhead - the business's own identity leads, since this
            document represents their brand to their client, not ours. */}
        <div className="flex items-center gap-3">
          {tenant?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt="" className="h-12 w-12 flex-none rounded-xl border border-black/8 bg-white object-contain p-1.5" />
          ) : (
            <div
              className="flex h-12 w-12 flex-none items-center justify-center rounded-xl font-display text-base font-bold text-white shadow-[0_10px_22px_-8px_rgba(23,20,15,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]"
              style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
            >
              {initialsFor(businessName)}
            </div>
          )}
          <div>
            <p className="font-display text-lg font-bold leading-tight text-ink">{businessName}</p>
            <p className="text-xs text-muted">
              Invoice {invoice.invoice_number} for {invoice.client_name}
              {invoice.milestone ? ` · ${invoice.milestone}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-black/8 bg-surface shadow-sm">
          <div className="h-1.5" style={{ background: "linear-gradient(90deg, var(--brand), var(--brand-strong))" }} />
          <div className="p-6 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {invoice.status === "paid" ? "Amount paid" : "Amount due"}
            </p>
            <p className="mt-1 font-sans text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              {formatGBP(invoice.status === "paid" ? invoice.amount_pence : outstanding)}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-ink-2">
                Due {new Date(invoice.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  invoice.status === "paid"
                    ? "bg-[rgba(12,163,12,0.15)] text-good"
                    : overdue
                      ? "bg-[rgba(208,59,59,0.15)] text-critical"
                      : "bg-surface-2 text-ink-2"
                }`}
              >
                {overdue ? "Overdue" : STATUS_LABEL[invoice.status] ?? invoice.status}
              </span>
            </div>

            {(invoice.paid_pence ?? 0) > 0 && invoice.status !== "paid" && (
              <div className="mt-3 flex flex-col gap-1 border-t border-black/8 pt-3 text-sm text-ink-2">
                <div className="flex justify-between">
                  <span>Invoice total</span>
                  <span className="font-mono">{formatGBP(invoice.amount_pence)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already paid</span>
                  <span className="font-mono">{formatGBP(invoice.paid_pence ?? 0)}</span>
                </div>
              </div>
            )}

            {searchParams.paid === "1" && invoice.status !== "paid" && (
              <p className="mt-4 rounded-lg bg-[rgba(12,163,12,0.1)] p-3.5 text-sm font-semibold text-good">
                Thanks - we're confirming your payment now. This page will show as paid shortly.
              </p>
            )}

            {canPayOnline && (
              <div className="mt-5">
                <PayInvoiceButton invoiceId={invoice.id} token={invoice.view_token} />
              </div>
            )}

            {tenant?.bank_details && invoice.status !== "paid" && (
              <div className="mt-5 border-t border-black/8 pt-4">
                <p className="text-xs font-semibold text-ink-2">Bank transfer details</p>
                <p className="mt-1 whitespace-pre-line text-xs text-muted">{tenant.bank_details}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-5 text-xs font-semibold text-muted">
          <a
            href={`/api/invoices/${invoice.id}/pdf?token=${invoice.view_token}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-brand hover:underline"
          >
            Download PDF
          </a>
          {tenant?.contact_email && (
            <a href={`mailto:${tenant.contact_email}`} className="hover:text-brand hover:underline">
              Query this invoice
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

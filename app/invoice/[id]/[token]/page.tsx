import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";

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
export default async function PublicInvoicePage({ params }: { params: { id: string; token: string } }) {
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, tenant_id, invoice_number, reference, milestone, client_name, amount_pence, paid_pence, due_date, status, view_token")
    .eq("id", params.id)
    .maybeSingle();

  if (!invoice || invoice.view_token !== params.token) notFound();

  const { data: tenant } = await admin
    .from("tenants")
    .select("business_name, brand_theme, bank_details, contact_email")
    .eq("id", invoice.tenant_id)
    .maybeSingle();

  const outstanding = invoice.amount_pence - (invoice.paid_pence ?? 0);
  const overdue = invoice.status !== "paid" && new Date(invoice.due_date + "T00:00:00") < new Date();

  return (
    <main className="min-h-screen bg-page px-5 py-10">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant?.brand_theme ?? "rust") }} />
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Invoice from {tenant?.business_name ?? "your contractor"}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink">{invoice.client_name}</h1>
        <p className="mt-1 text-xs text-muted">
          {invoice.invoice_number}
          {invoice.milestone ? ` · ${invoice.milestone}` : ""}
        </p>

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-2">Amount</span>
            <span className="font-mono text-2xl font-bold text-ink">{formatGBP(invoice.amount_pence)}</span>
          </div>
          {(invoice.paid_pence ?? 0) > 0 && (
            <>
              <div className="mt-2 flex items-center justify-between text-sm text-ink-2">
                <span>Paid</span>
                <span className="font-mono">{formatGBP(invoice.paid_pence ?? 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm font-semibold text-ink">
                <span>Outstanding</span>
                <span className="font-mono">{formatGBP(outstanding)}</span>
              </div>
            </>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3">
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

          {tenant?.bank_details && invoice.status !== "paid" && (
            <div className="mt-4 border-t border-black/10 pt-3">
              <p className="text-xs font-semibold text-ink-2">Payment details</p>
              <p className="mt-1 whitespace-pre-line text-xs text-muted">{tenant.bank_details}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <a
            href={`/api/invoices/${invoice.id}/pdf?token=${invoice.view_token}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg border border-black/10 bg-surface px-4 py-3 text-center text-sm font-semibold text-ink-2 hover:bg-surface-2"
          >
            Download PDF
          </a>
          {tenant?.contact_email && (
            <a
              href={`mailto:${tenant.contact_email}`}
              className="flex-1 rounded-lg border border-black/10 bg-surface px-4 py-3 text-center text-sm font-semibold text-ink-2 hover:bg-surface-2"
            >
              Query this invoice
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

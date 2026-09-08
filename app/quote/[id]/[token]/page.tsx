import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { QuoteResponseButtons } from "@/app/quote/QuoteResponseButtons";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  subcontractors: "Subcontractors",
  other: "Other",
};

// No auth on this route at all - the accept_token in the URL (an
// unguessable uuid, same idea as tenants.site_key) is what proves the
// visitor is the intended recipient, so this reads via the service-role
// admin client rather than the session-scoped one. Wrong id/token -> 404,
// same as if the quote never existed - doesn't leak whether a quote id is
// real.
export default async function PublicQuotePage({
  params,
}: {
  params: { id: string; token: string };
}) {
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select(
      "id, tenant_id, quote_number, client_name, line_items, cost_subtotal_pence, markup_percent, vat_rate, vat_amount_pence, total_pence, status, expires_at, deposit_pence, payment_terms, exclusions, terms, accept_token"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!quote || quote.accept_token !== params.token) notFound();

  const { data: tenant } = await admin
    .from("tenants")
    .select("business_name, brand_theme")
    .eq("id", quote.tenant_id)
    .maybeSingle();

  const expired = quote.expires_at ? new Date(quote.expires_at + "T00:00:00") < new Date() : false;
  const decided = quote.status === "accepted" || quote.status === "declined";
  const saleSubtotal = quote.total_pence - quote.vat_amount_pence;

  return (
    <main className="min-h-screen bg-page px-5 py-10">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant?.brand_theme ?? "rust") }} />
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Quote from {tenant?.business_name ?? "your contractor"}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink">{quote.client_name}</h1>
        {quote.quote_number && <p className="mt-1 text-xs text-muted">{quote.quote_number}</p>}

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            {quote.line_items.map((item: { category: string; description: string; unit_price_pence: number }, i: number) => (
              <div key={i} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {CATEGORY_LABEL[item.category] ?? "Other"}
                  </span>
                  <p className="text-ink">{item.description || "—"}</p>
                </div>
                <span className="whitespace-nowrap font-mono text-ink">{formatGBP(item.unit_price_pence)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-1 border-t border-black/10 pt-3 text-sm text-ink-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{formatGBP(saleSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT ({quote.vat_rate}%)</span>
              <span className="font-mono">{formatGBP(quote.vat_amount_pence)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-ink">
              <span>Total</span>
              <span className="font-mono">{formatGBP(quote.total_pence)}</span>
            </div>
            {quote.deposit_pence != null && (
              <div className="flex justify-between">
                <span>Deposit required</span>
                <span className="font-mono">{formatGBP(quote.deposit_pence)}</span>
              </div>
            )}
          </div>

          {(quote.payment_terms || quote.exclusions || quote.terms) && (
            <div className="mt-4 flex flex-col gap-2 border-t border-black/10 pt-3 text-xs text-muted">
              {quote.payment_terms && (
                <p>
                  <span className="font-semibold text-ink-2">Payment terms: </span>
                  {quote.payment_terms}
                </p>
              )}
              {quote.exclusions && (
                <p>
                  <span className="font-semibold text-ink-2">Exclusions: </span>
                  {quote.exclusions}
                </p>
              )}
              {quote.terms && (
                <p>
                  <span className="font-semibold text-ink-2">Terms: </span>
                  {quote.terms}
                </p>
              )}
            </div>
          )}

          {quote.expires_at && (
            <p className="mt-3 text-xs text-muted">
              {expired ? "This quote expired on " : "Valid until "}
              {new Date(quote.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          )}
        </div>

        <div className="mt-5">
          {decided ? (
            <p
              className={`rounded-lg p-4 text-sm font-semibold ${
                quote.status === "accepted" ? "bg-[rgba(12,163,12,0.1)] text-good" : "bg-surface-2 text-ink-2"
              }`}
            >
              {quote.status === "accepted" ? "You accepted this quote." : "You declined this quote."}
            </p>
          ) : expired ? (
            <p className="rounded-lg bg-[rgba(208,59,59,0.08)] p-4 text-sm font-semibold text-critical">
              This quote has expired. Get in touch for an updated quote.
            </p>
          ) : (
            <QuoteResponseButtons quoteId={quote.id} token={quote.accept_token} />
          )}
        </div>
      </div>
    </main>
  );
}

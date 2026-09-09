import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { updateTenantSettings, uploadTenantLogo } from "@/app/dashboard/actions";
import { signOut } from "@/app/login/actions";
import { IconSettings } from "@/components/DashboardIcons";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUserRole } from "@/lib/membershipRole";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink outline-none transition-colors focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export default async function SettingsPage({ searchParams }: { searchParams: { stripe?: string } }) {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  // Settings holds bank details, VAT, the Stripe connection - the one page
  // a 'member' shouldn't reach, even though they can see everything else.
  if (role === "member") redirect("/dashboard");

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <header>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-ink sm:text-3xl">
            <IconSettings className="h-5 w-5 text-brand" />
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted">Defaults for {tenant.business_name} - override any of these per-quote.</p>
        </header>

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Logo</h2>
          <p className="mt-1 text-xs text-muted">Shown on quote and invoice PDFs.</p>
          <form action={uploadTenantLogo} className="mt-3 flex items-center gap-3">
            <input type="hidden" name="tenantId" value={tenant.id} />
            {tenant.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="" className="h-12 w-12 rounded-lg border border-black/8 object-contain bg-white p-1" />
            )}
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" required className={field} />
            <button type="submit" className="btn-primary flex-none rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">
              Upload
            </button>
          </form>
        </div>

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Online payment</h2>
          {searchParams.stripe === "error" && (
            <p className="mt-1 text-xs font-semibold text-critical">Something went wrong connecting Stripe - try again.</p>
          )}
          {tenant.stripe_account_id ? (
            <>
              <p className="mt-1 text-xs text-muted">
                Connected. Customers see a "Pay now" button on their invoice page - payments go straight to your own
                Stripe account, not through Scalar Digital.
              </p>
              <p className="mt-2 font-mono text-xs text-muted">{tenant.stripe_account_id}</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                Connect Stripe to let customers pay an invoice online. Payments go directly to your own bank account
                via your own Stripe account.
              </p>
              <a
                href="/api/stripe/connect"
                className="btn-primary mt-3 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong"
              >
                Connect Stripe
              </a>
            </>
          )}
        </div>

        <form
          action={updateTenantSettings.bind(null, tenant.id)}
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm"
        >
          <h2 className="text-sm font-bold text-ink">Business profile</h2>
          <label className={label}>
            Company address
            <textarea name="companyAddress" rows={2} defaultValue={tenant.company_address ?? ""} className={field} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={label}>
              VAT number
              <input name="vatNumber" defaultValue={tenant.vat_number ?? ""} placeholder="GB123456789" className={field} />
            </label>
          </div>
          <label className={label}>
            Bank details
            <textarea
              name="bankDetails"
              rows={2}
              defaultValue={tenant.bank_details ?? ""}
              placeholder="Account name, sort code, account number"
              className={field}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={label}>
              Quote number prefix
              <input name="quoteNumberPrefix" defaultValue={tenant.quote_number_prefix} className={field} />
            </label>
            <label className={label}>
              Invoice number prefix
              <input name="invoiceNumberPrefix" defaultValue={tenant.invoice_number_prefix} className={field} />
            </label>
          </div>

          <h2 className="mt-2 text-sm font-bold text-ink border-t border-black/8 pt-4">Quote &amp; invoice defaults</h2>
          <label className={label}>
            Default VAT rate (%)
            <input
              name="defaultVatRate"
              type="number"
              min="0"
              step="0.1"
              defaultValue={tenant.default_vat_rate}
              className={field}
            />
          </label>
          <label className={label}>
            Default quote terms &amp; conditions
            <textarea
              name="defaultQuoteTerms"
              rows={4}
              defaultValue={tenant.default_quote_terms ?? ""}
              placeholder="e.g. Quote valid for 30 days. Materials remain the property of the company until paid in full."
              className={field}
            />
          </label>
          <label className={label}>
            Default payment terms
            <input
              name="defaultPaymentTerms"
              defaultValue={tenant.default_payment_terms ?? ""}
              placeholder="e.g. 50% deposit, balance on completion"
              className={field}
            />
          </label>
          <label className={label}>
            Google review link
            <input
              name="googleReviewUrl"
              type="url"
              defaultValue={tenant.google_review_url ?? ""}
              placeholder="https://g.page/r/.../review"
              className={field}
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              From your Google Business Profile ("Get more reviews" / "Ask for reviews"). Once set, marking a
              project complete automatically emails the customer this link.
            </span>
          </label>
          <button
            type="submit"
            className="btn-primary self-start rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong"
          >
            Save settings
          </button>
        </form>
      </div>
    </main>
  );
}

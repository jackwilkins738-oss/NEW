import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { updateTenantSettings, uploadTenantLogo } from "@/app/dashboard/actions";
import { signOut } from "@/app/login/actions";
import { IconSettings } from "@/components/DashboardIcons";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink outline-none transition-colors focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export default async function SettingsPage(props: { searchParams: Promise<{ stripe?: string }> }) {
  const searchParams = await props.searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  // Settings holds bank details, VAT, the Stripe connection - the one page
  // a 'member' shouldn't reach, even though they can see everything else.
  if (role === "member") redirect("/dashboard");

  // The automatic-email switches (migrations 044/045). Read separately so a
  // database without 045 yet just hides them instead of breaking Settings.
  const { data: automations, error: automationsError } = await createAdminClient()
    .from("tenants")
    .select("quote_chasers, auto_review_requests")
    .eq("id", tenant.id)
    .maybeSingle();
  const showAutomations = !automationsError && !!automations;
  const { data: depositRow, error: depositError } = await createAdminClient()
    .from("tenants")
    .select("auto_send_deposit")
    .eq("id", tenant.id)
    .maybeSingle();
  const showDepositSwitch = !depositError && !!depositRow;

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
                Connected. Customers see a &quot;Pay now&quot; button on their invoice page - payments go straight to your own
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
              From your Google Business Profile (&quot;Get more reviews&quot; / &quot;Ask for reviews&quot;). Used by the
              &quot;Send request&quot; button on a review, and by the automatic requests below.
            </span>
          </label>

          {showAutomations && (
            <>
              <h2 className="mt-2 text-sm font-bold text-ink border-t border-black/8 pt-4">Automatic follow-ups</h2>
              <input type="hidden" name="automations" value="1" />
              <label className="flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  name="autoReviewRequests"
                  defaultChecked={!!automations.auto_review_requests}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="font-semibold">Ask for Google reviews automatically</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    2 days after you mark a job complete, the customer is emailed your review link, with one reminder a week
                    later - never more. Needs the review link above. Sending one yourself counts as the first ask.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  name="quoteChasers"
                  defaultChecked={!!automations.quote_chasers}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="font-semibold">Chase unanswered quotes</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    A short, polite follow-up 3 days after a quote is sent, and one more 4 days later - stops as soon as
                    they accept or decline.
                  </span>
                </span>
              </label>
            </>
          )}

          {showDepositSwitch && (
            <>
              <input type="hidden" name="depositAutomation" value="1" />
              <label className="flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  name="autoSendDeposit"
                  defaultChecked={!!depositRow.auto_send_deposit}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  <span className="font-semibold">Send the deposit invoice when a quote is accepted</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    When a customer accepts online, the job is always created and you&apos;re emailed straight away. With
                    this on, their deposit invoice is emailed to them at the same moment too.
                  </span>
                </span>
              </label>
            </>
          )}
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

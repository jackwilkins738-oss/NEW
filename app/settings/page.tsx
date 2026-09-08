import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { updateTenantSettings } from "@/app/dashboard/actions";
import { IconSettings } from "@/components/DashboardIcons";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export default async function SettingsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-xs font-semibold text-muted hover:text-brand hover:underline">
          &larr; Back to dashboard
        </Link>

        <header className="mt-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconSettings className="h-5 w-5 text-brand" />
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted">Defaults for {tenant.business_name} - override any of these per-quote.</p>
        </header>

        <form
          action={updateTenantSettings.bind(null, tenant.id)}
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm"
        >
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
            className="btn-primary self-start rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong"
          >
            Save settings
          </button>
        </form>
      </div>
    </main>
  );
}

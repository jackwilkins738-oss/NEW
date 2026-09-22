import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { initialsFor } from "@/lib/initials";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { brandThemeStyleTag } from "@/lib/theme";
import { signIn, adminSignIn } from "./actions";
import { PasswordField } from "./PasswordField";
import { DashboardPreview } from "./DashboardPreview";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const tenant = await getCurrentTenant();
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    if (tenant) {
      redirect("/dashboard");
    } else if (await isPlatformAdmin(data.user.id)) {
      redirect("/admin");
    }
    // Signed in, but neither a member of a tenant on this domain nor a
    // platform admin - fall through to the sign-in form rather than
    // redirect anywhere, which would just bounce right back here (a loop).
  }

  // No tenant matches this domain - by design, that's what the admin domain
  // looks like (it doesn't belong to any customer). Rather than a dead end,
  // show a generic sign-in that checks platform_admins instead of a
  // tenant membership, so there's still a way back in if a session expires.
  const isAdminDomain = !tenant;
  const brandName = tenant ? tenant.business_name : "Scalar Digital";

  return (
    <main className="grid min-h-screen bg-page lg:grid-cols-[minmax(0,52%)_1fr]">
      {tenant && <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />}

      {/* Left brand panel - hidden below lg, where the form alone is the
          whole page (see form-header's mobile mark below). */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-hairline px-12 py-12 lg:flex xl:px-16">
        {/* Same blueprint-grid-plus-glow the rest of the app uses (see body{}
            in globals.css) rather than a one-off decoration invented just for
            this page - it's what makes the panel read as this product, not a
            generic dark login template pasted in front of it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(900px 560px at 15% -10%, color-mix(in srgb, var(--brand) 7%, transparent), transparent 65%),
              linear-gradient(color-mix(in srgb, var(--hairline) 55%, var(--page-bg)) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in srgb, var(--hairline) 55%, var(--page-bg)) 1px, transparent 1px)
            `,
            backgroundSize: "100% 100%, 56px 56px, 56px 56px",
            maskImage: "radial-gradient(ellipse 90% 80% at 30% 40%, black 40%, transparent 90%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 30% 40%, black 40%, transparent 90%)",
          }}
        />
        <div className="grain-overlay" />

        {/* Two soft brand-tinted orbs drifting slowly behind the copy - not
            noticed consciously, just enough ambient motion that the panel
            doesn't sit dead-still next to the live preview card below. */}
        <div
          aria-hidden
          className="login-orb pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)" }}
        />
        <div
          aria-hidden
          className="login-orb login-orb-delay pointer-events-none absolute bottom-10 right-10 h-48 w-48 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--brand-strong) 9%, transparent)" }}
        />
        <div className="relative flex items-center gap-3">
          {tenant?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt="" className="h-9 w-9 flex-none rounded-lg border border-black/8 bg-white object-contain p-1" />
          ) : (
            <div
              className="flex h-9 w-9 flex-none items-center justify-center rounded-lg font-display text-sm font-bold text-white shadow-[0_10px_22px_-8px_rgba(23,20,15,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]"
              style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
            >
              {initialsFor(brandName)}
            </div>
          )}
          <span className="font-display text-lg font-bold tracking-tight text-ink">{brandName}</span>
        </div>

        <div className="relative max-w-md py-10">
          <div className="login-badge-ring mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-brand-tint px-3.5 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "var(--brand)" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand)" }} />
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--brand)" }}>
              {tenant ? "Operations & Sales Dashboard" : "Scalar Digital"}
            </span>
          </div>

          {tenant ? (
            <>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink xl:text-5xl">
                <span className="login-line login-line-1">Run the job,</span>
                <span className="login-line login-line-2" style={{ color: "var(--brand)" }}>
                  not the paperwork.
                </span>
              </h1>
              <p className="login-line login-line-2 mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
                Leads, quotes, invoices and the calendar - everything {brandName} needs to run the business, in one
                place.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink xl:text-5xl">
                <span className="login-line login-line-1">Customer admin.</span>
              </h1>
              <p className="login-line login-line-2 mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
                Sign in with a platform admin account to manage every business running on Scalar Digital.
              </p>
            </>
          )}

          {/* A real glimpse of the product, not another paragraph about it -
              replaces the old text-bullet list below the headline. Tenant-only:
              the admin domain has no business data to preview. */}
          {tenant && (
            <div className="login-preview-enter relative mt-8">
              <DashboardPreview />
            </div>
          )}
        </div>

        {isAdminDomain && (
          <a
            href="https://scalardigital.co.uk"
            className="relative inline-flex w-fit items-center gap-2 font-mono text-[13px] font-medium text-muted transition-colors hover:text-ink-2"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 10H4" />
              <path d="M9 5l-5 5 5 5" />
            </svg>
            Back to scalardigital.co.uk
          </a>
        )}
      </aside>

      {/* Right form panel - previously a flat bg-page with the form
          floating directly on it; now carries the same textured background
          the left panel and the rest of the app use (mirrored, lower
          intensity so it recedes behind a contained card) rather than
          reading as an unfinished half of the page. */}
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-10 sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(900px 560px at 85% 110%, color-mix(in srgb, var(--brand) 4%, transparent), transparent 65%),
              linear-gradient(color-mix(in srgb, var(--hairline) 45%, var(--page-bg)) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in srgb, var(--hairline) 45%, var(--page-bg)) 1px, transparent 1px)
            `,
            backgroundSize: "100% 100%, 56px 56px, 56px 56px",
          }}
        />
        <div className="grain-overlay" />

        <div className="relative w-full max-w-sm">
          {/* Mark shown only when the brand panel is hidden (below lg) -
              otherwise the page has no identity at all on a phone. */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="" className="h-8 w-8 flex-none rounded-lg border border-black/8 bg-white object-contain p-1" />
            ) : (
              <div
                className="flex h-8 w-8 flex-none items-center justify-center rounded-lg font-display text-xs font-bold text-white"
                style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
              >
                {initialsFor(brandName)}
              </div>
            )}
            <span className="font-display text-base font-bold tracking-tight text-ink">{brandName}</span>
          </div>

          {/* Contained card instead of the form floating directly on the
              page - the same elevation tokens (--card-shadow-*) the
              dashboard's own KPI tiles use, so this reads as one more
              considered surface in the same system rather than a login
              template bolted on the front of it. */}
          <div
            className="login-card-enter relative overflow-hidden rounded-2xl border p-7 sm:p-8"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--surface)",
              boxShadow: `0 1px 0 0 var(--card-highlight) inset, 0 1px 2px var(--card-shadow-tight), 0 32px 64px -28px var(--card-shadow-ambient)`,
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-20"
              style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 5%, transparent), transparent)" }}
            />

            <p className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {tenant ? "Operations & Sales Dashboard" : "Scalar Digital"}
            </p>
            <h2 className="font-display relative mt-1 text-2xl font-extrabold leading-tight text-ink">Welcome back</h2>
            <p className="relative mt-1.5 text-sm text-muted">
              {tenant ? `Sign in to ${brandName}'s dashboard.` : "Sign in with your admin account."}
            </p>

            <form action={isAdminDomain ? adminSignIn : signIn} className="login-field-stagger relative mt-7 flex flex-col gap-4">
              <label className="block text-sm font-medium text-ink-2">
                Email
                <div className="relative mt-1.5">
                  <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
                    <path d="M3 5.5l7 5.5 7-5.5" />
                  </svg>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    className="login-input w-full rounded-xl border border-black/15 bg-page py-2.5 pl-9 pr-3.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none sm:text-sm"
                  />
                </div>
              </label>

              <PasswordField />

              {!isAdminDomain && (
                <a href="/forgot-password" className="-mt-2 self-end text-xs font-semibold text-brand hover:underline">
                  Forgot password?
                </a>
              )}

              {tenant && <input type="hidden" name="tenantId" value={tenant.id} />}

              {searchParams.error && (
                <p className="text-sm font-medium text-critical">{searchParams.error}</p>
              )}

              <button
                type="submit"
                className="login-button mt-2 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(23,20,15,0.6)] hover:bg-brand-strong"
              >
                Sign in
              </button>
            </form>
          </div>

          <p className="relative mt-6 text-center text-xs text-muted">
            Powered by Scalar Digital &middot; <a href="/privacy" className="hover:text-brand hover:underline">Privacy</a> &middot;{" "}
            <a href="/terms" className="hover:text-brand hover:underline">Terms</a>
          </p>
        </div>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { initialsFor } from "@/lib/initials";

export const dynamic = "force-dynamic";

const PROJECT_STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
  awaiting_decision: "Awaiting decision",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Partially paid",
  paid: "Paid",
};

const VARIATION_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting your decision",
  approved: "Approved",
  declined: "Declined",
};

// One link per project instead of a separate one per quote/invoice - the
// customer's whole job in one place. Same no-login trust model as the
// public quote/invoice pages: portal_token in the URL (an unguessable
// uuid) proves the visitor is the intended recipient, so this reads via
// the service-role admin client rather than a session-scoped one.
export default async function ProjectPortalPage({ params }: { params: { id: string; token: string } }) {
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select(
      "id, tenant_id, ref, client_name, location, project_type, stage, status, start_date, target_date, completed_at, portal_token, quote_id"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!project || project.portal_token !== params.token) notFound();

  const [tenantRes, quoteRes, invoicesRes, variationsRes, photosRes] = await Promise.all([
    admin.from("tenants").select("business_name, brand_theme, logo_url, contact_email").eq("id", project.tenant_id).maybeSingle(),
    project.quote_id
      ? admin.from("quotes").select("id, quote_number, total_pence, status, accept_token").eq("id", project.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("invoices")
      .select("id, invoice_number, milestone, reference, amount_pence, paid_pence, due_date, status, view_token")
      .eq("project_id", project.id)
      .order("due_date", { ascending: true }),
    admin
      .from("variations")
      .select("id, number, description, customer_price_pence, status, additional_days")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    admin
      .from("project_photos")
      .select("id, storage_path, caption, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const tenant = tenantRes.data;
  const quote = quoteRes.data;
  const invoices = invoicesRes.data ?? [];
  const variations = variationsRes.data ?? [];
  const photos = photosRes.data ?? [];
  const businessName = tenant?.business_name ?? "Your contractor";

  const publicPhotoUrl = (storagePath: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/project-photos/${storagePath}`;

  const totalOutstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + (i.amount_pence - (i.paid_pence ?? 0)), 0);

  return (
    <main className="min-h-screen bg-page px-5 py-10 sm:py-14">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant?.brand_theme ?? "rust") }} />
      <div className="mx-auto max-w-2xl">
        {/* Letterhead - same treatment as the public quote/invoice pages */}
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
            <p className="text-xs text-muted">Your project portal</p>
          </div>
        </div>

        {/* Project header */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-black/8 bg-surface shadow-sm">
          <div className="h-1.5" style={{ background: "linear-gradient(90deg, var(--brand), var(--brand-strong))" }} />
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  {project.ref}
                  {project.project_type ? ` · ${project.project_type}` : ""}
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold text-ink">{project.client_name}</p>
                {project.location && <p className="mt-1 text-sm text-muted">{project.location}</p>}
              </div>
              {project.completed_at ? (
                <span className="rounded-full bg-[rgba(12,163,12,0.15)] px-2.5 py-1 text-xs font-bold text-good">Completed</span>
              ) : project.status ? (
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-2">
                  {PROJECT_STATUS_LABEL[project.status] ?? project.status}
                </span>
              ) : null}
            </div>

            {(project.start_date || project.target_date) && (
              <p className="mt-3 text-sm text-ink-2">
                {project.start_date ?? "Start date TBC"} &rarr; {project.target_date ?? "Completion TBC"}
              </p>
            )}

            {totalOutstanding > 0 && (
              <div className="mt-4 border-t border-black/8 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Outstanding</p>
                <p className="mt-1 font-sans text-2xl font-extrabold text-ink">{formatGBP(totalOutstanding)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Photos */}
        {photos.length > 0 && (
          <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Progress photos</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={publicPhotoUrl(p.storage_path)}
                  alt={p.caption ?? ""}
                  className="aspect-square w-full rounded-lg border border-black/8 object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {/* Quote */}
        {quote && (
          <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Quote</h2>
            <div className="row-hover mt-2 flex items-center justify-between rounded-lg px-1 py-1.5">
              <p className="text-sm text-ink-2">
                {quote.quote_number ?? "Quote"}{" "}
                <span className="text-xs text-muted">
                  &middot; {quote.status === "accepted" ? "Accepted" : quote.status}
                </span>
              </p>
              <a href={`/quote/${quote.id}/${quote.accept_token}`} className="text-xs font-semibold text-brand hover:underline">
                View &rarr;
              </a>
            </div>
          </div>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Invoices</h2>
            <div className="mt-2 flex flex-col">
              {invoices.map((inv) => {
                const outstanding = inv.amount_pence - (inv.paid_pence ?? 0);
                return (
                  <a
                    key={inv.id}
                    href={`/invoice/${inv.id}/${inv.view_token}`}
                    className="row-hover flex items-center justify-between gap-3 border-b border-black/8 py-2.5 last:border-none hover:bg-surface-2"
                  >
                    <div>
                      <p className="text-sm text-ink-2">
                        {inv.milestone ?? inv.invoice_number ?? "Invoice"}
                        <span className="ml-2 text-xs text-muted">
                          due {new Date(inv.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-ink">{formatGBP(inv.amount_pence)}</p>
                      <p className={`text-xs font-semibold ${inv.status === "paid" ? "text-good" : "text-muted"}`}>
                        {inv.status === "paid" ? "Paid" : `${formatGBP(outstanding)} due`}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Variations */}
        {variations.length > 0 && (
          <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Changes to the original scope</h2>
            <div className="mt-2 flex flex-col">
              {variations.map((v) => (
                <div key={v.id} className="border-b border-black/8 py-2.5 last:border-none">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-2">
                      {v.number ?? "Variation"}
                      {v.additional_days ? ` · +${v.additional_days}d` : ""}
                    </p>
                    <p className="font-mono text-sm font-semibold text-ink">{formatGBP(v.customer_price_pence)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{v.description}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      v.status === "approved"
                        ? "bg-[rgba(12,163,12,0.15)] text-good"
                        : v.status === "declined"
                          ? "bg-surface-2 text-ink-2"
                          : "bg-[rgba(250,178,25,0.2)] text-[#8a5a00]"
                    }`}
                  >
                    {VARIATION_STATUS_LABEL[v.status] ?? v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tenant?.contact_email && (
          <div className="mt-5 text-center">
            <a href={`mailto:${tenant.contact_email}`} className="text-xs font-semibold text-muted hover:text-brand hover:underline">
              Questions about your project? Get in touch
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

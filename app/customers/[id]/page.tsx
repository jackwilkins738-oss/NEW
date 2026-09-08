import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";

export const dynamic = "force-dynamic";

const PROJECT_STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
  awaiting_decision: "Awaiting decision",
};

export default async function CustomerPage({ params }: { params: { id: string } }) {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, email, phone, address, notes, created_at")
    .eq("id", params.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!customer) notFound();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, ref, client_name, value_pence, status, stage, start_date, target_date")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id);

  const [invoicesByCustomerRes, invoicesByProjectRes, photosRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, reference, amount_pence, due_date, status, project_id")
      .eq("customer_id", customer.id),
    projectIds.length > 0
      ? supabase.from("invoices").select("id, reference, amount_pence, due_date, status, project_id").in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
    projectIds.length > 0
      ? supabase.from("project_photos").select("id, storage_path, caption, project_id").in("project_id", projectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  // A customer's invoices can be linked directly (customer_id) or only via
  // their project (project_id) - not every invoice-creation path sets both,
  // so both are gathered and deduped rather than trusting one link alone.
  const invoiceMap = new Map<string, { id: string; reference: string | null; amount_pence: number; due_date: string; status: string }>();
  for (const inv of [...(invoicesByCustomerRes.data ?? []), ...(invoicesByProjectRes.data ?? [])]) {
    invoiceMap.set(inv.id, inv);
  }
  const invoices = [...invoiceMap.values()].sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
  const photos = photosRes.data ?? [];

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.amount_pence, 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount_pence, 0);
  const totalOutstanding = totalInvoiced - totalPaid;

  const publicPhotoUrl = (storagePath: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/project-photos/${storagePath}`;

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <div className="mx-auto max-w-3xl">
        <Link href="/customers" className="text-xs font-semibold text-muted hover:text-brand hover:underline">
          &larr; Back to customers
        </Link>

        <header className="mt-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm">
          <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">{customer.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="hover:text-brand hover:underline">
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="hover:text-brand hover:underline">
                {customer.phone}
              </a>
            )}
            {customer.address && <span>{customer.address}</span>}
          </div>
          {customer.notes && <p className="mt-2 text-sm text-muted">{customer.notes}</p>}
        </header>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-black/10 bg-surface p-4 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Invoiced</p>
            <p className="mt-1 font-mono text-lg font-bold text-ink">{formatGBP(totalInvoiced)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-4 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Paid</p>
            <p className="mt-1 font-mono text-lg font-bold text-good">{formatGBP(totalPaid)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-4 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Outstanding</p>
            <p className={`mt-1 font-mono text-lg font-bold ${totalOutstanding > 0 ? "text-critical" : "text-ink"}`}>
              {formatGBP(totalOutstanding)}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Projects</h2>
          {(projects ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted">No projects for this customer yet.</p>
          ) : (
            <div className="mt-2 flex flex-col">
              {(projects ?? []).map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="row-hover flex items-center justify-between gap-3 border-b border-black/10 py-3 last:border-none hover:bg-surface-2"
                >
                  <div>
                    <p className="font-mono text-xs text-muted">{p.ref}</p>
                    <p className="text-sm font-semibold text-ink">
                      {p.stage ?? "—"}
                      {p.target_date ? ` · due ${new Date(p.target_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-ink">
                      {p.value_pence != null ? formatGBP(p.value_pence) : "—"}
                    </p>
                    <p className="text-xs text-muted">{PROJECT_STATUS_LABEL[p.status ?? ""] ?? p.status}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Invoices</h2>
          {invoices.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No invoices for this customer yet.</p>
          ) : (
            <div className="mt-2 flex flex-col">
              {invoices.map((inv) => (
                <div key={inv.id} className="row-hover flex items-center justify-between gap-3 border-b border-black/10 py-2.5 last:border-none">
                  <p className="text-sm text-ink-2">{inv.reference ?? "no reference"}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{formatGBP(inv.amount_pence)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        inv.status === "paid" ? "bg-[rgba(12,163,12,0.15)] text-good" : "bg-surface-2 text-ink-2"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {photos.length > 0 && (
          <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Photos</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => (
                <img
                  key={photo.id}
                  src={publicPhotoUrl(photo.storage_path)}
                  alt={photo.caption ?? ""}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

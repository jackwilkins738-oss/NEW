import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  subcontractors: "Subcontractors",
  plant: "Plant",
  other: "Other",
};

export default async function CashflowPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [invoicesRes, costItemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, client_name, reference, amount_pence, paid_pence, due_date, status")
      .eq("tenant_id", tenant.id)
      .neq("status", "paid")
      .order("due_date", { ascending: true }),
    supabase
      .from("project_cost_items")
      .select("id, category, description, amount_pence, status, cost_date")
      .eq("tenant_id", tenant.id)
      .eq("status", "committed"),
  ]);

  const invoices = invoicesRes.data ?? [];
  const costItems = costItemsRes.data ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today.getTime() + 7 * 86_400_000);
  const in30Days = new Date(today.getTime() + 30 * 86_400_000);

  const overdue = invoices.filter((i) => new Date(i.due_date + "T00:00:00") < today);
  const dueThisWeek = invoices.filter((i) => {
    const due = new Date(i.due_date + "T00:00:00");
    return due >= today && due <= in7Days;
  });
  const dueNext30 = invoices.filter((i) => {
    const due = new Date(i.due_date + "T00:00:00");
    return due > in7Days && due <= in30Days;
  });
  const dueLater = invoices.filter((i) => new Date(i.due_date + "T00:00:00") > in30Days);

  const sum = (rows: { amount_pence: number }[]) => rows.reduce((s, r) => s + r.amount_pence, 0);
  const outstandingSum = (rows: { amount_pence: number; paid_pence: number | null }[]) =>
    rows.reduce((s, r) => s + (r.amount_pence - (r.paid_pence ?? 0)), 0);
  const totalIn = outstandingSum(invoices);

  const costByCategory = new Map<string, number>();
  for (const item of costItems) {
    costByCategory.set(item.category, (costByCategory.get(item.category) ?? 0) + item.amount_pence);
  }
  const totalOut = sum(costItems);
  const netPosition = totalIn - totalOut;

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-xs font-semibold text-muted hover:text-brand hover:underline">
          &larr; Back to dashboard
        </Link>

        <header className="mt-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm">
          <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">Cashflow</h1>
          <p className="mt-1 text-sm text-muted">
            Money coming in (unpaid invoices) against money going out (costs logged but not yet paid) - profit and
            cash aren't the same thing.
          </p>
        </header>

        <div className="mt-5 rounded-2xl border border-black/10 bg-brand-tint p-5 shadow-sm">
          <p className="text-sm font-semibold text-brand-strong">Expected cash position</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-ink sm:text-4xl">{formatGBP(netPosition)}</p>
          <p className="mt-1 text-xs text-brand-strong">
            {formatGBP(totalIn)} expected in &minus; {formatGBP(totalOut)} committed out
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Money coming in</h2>
            <p className="text-xs text-muted">Unpaid invoices, {formatGBP(totalIn)} total</p>

            <div className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-[rgba(208,59,59,0.08)] px-3 py-2">
                <span className="font-semibold text-critical">Overdue</span>
                <span className="font-mono font-semibold text-ink">{formatGBP(outstandingSum(overdue))}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[rgba(250,178,25,0.1)] px-3 py-2">
                <span className="font-semibold text-[#8a5a00]">Due this week</span>
                <span className="font-mono font-semibold text-ink">{formatGBP(outstandingSum(dueThisWeek))}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                <span className="font-semibold text-ink-2">Due in 30 days</span>
                <span className="font-mono font-semibold text-ink">{formatGBP(outstandingSum(dueNext30))}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                <span className="font-semibold text-ink-2">Due later</span>
                <span className="font-mono font-semibold text-ink">{formatGBP(outstandingSum(dueLater))}</span>
              </div>
            </div>

            {invoices.length === 0 && <p className="mt-3 text-sm text-muted">No unpaid invoices right now.</p>}
          </div>

          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Money going out</h2>
            <p className="text-xs text-muted">Costs committed but not yet paid, {formatGBP(totalOut)} total</p>

            <div className="mt-3 flex flex-col gap-2 text-sm">
              {["materials", "labour", "subcontractors", "plant", "other"].map((cat) => (
                <div key={cat} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <span className="font-semibold text-ink-2">{CATEGORY_LABEL[cat]}</span>
                  <span className="font-mono font-semibold text-ink">{formatGBP(costByCategory.get(cat) ?? 0)}</span>
                </div>
              ))}
            </div>

            {costItems.length === 0 && <p className="mt-3 text-sm text-muted">No committed costs outstanding right now.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

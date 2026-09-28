import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { toCsv } from "@/lib/csv";
import { costRows, exportPeriods, invoiceRows, xeroRows, type ExportKind } from "@/lib/accountsExport";

// Accountant exports (lib/accountsExport.ts). RLS decides which invoices and
// costs come back; the membership check is what lets the VAT setup be read
// with the service role (vat_number isn't in the session column grant, 039).

// A to-one embed can come back as an object or a one-item array.
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId") ?? "";
  const kind = params.get("kind") as ExportKind;
  const periods = exportPeriods();
  const period = periods.find((p) => p.key === params.get("period")) ?? periods[periods.length - 1];
  if (!tenantId || !["xero", "invoices", "costs"].includes(kind)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!(await getCurrentUserRole(supabase, tenantId, userData.user.id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  let table: { headers: string[]; rows: string[][] };
  if (kind === "costs") {
    let query = supabase
      .from("project_cost_items")
      .select("cost_date, created_at, category, description, supplier, amount_pence, status, projects(client_name)")
      .eq("tenant_id", tenantId)
      .order("cost_date", { ascending: true });
    if (period.from) query = query.gte("cost_date", period.from);
    if (period.to) query = query.lte("cost_date", period.to);
    const { data } = await query;
    table = costRows((data ?? []).map((c) => ({ ...c, project: one(c.projects as { client_name: string } | { client_name: string }[] | null)?.client_name ?? null })));
  } else {
    let query = supabase
      .from("invoices")
      .select("invoice_number, client_name, reference, milestone, amount_pence, paid_pence, status, due_date, created_at, customers(email)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (period.from) query = query.gte("created_at", `${period.from}T00:00:00Z`);
    if (period.to) query = query.lte("created_at", `${period.to}T23:59:59Z`);
    const { data } = await query;
    const { data: tenant } = await createAdminClient().from("tenants").select("vat_number, default_vat_rate").eq("id", tenantId).maybeSingle();
    const vat = { registered: !!tenant?.vat_number?.trim(), ratePercent: Number(tenant?.default_vat_rate ?? 20) };
    const invoices = (data ?? []).map((i) => ({
      ...i,
      customer_email: one(i.customers as { email: string | null } | { email: string | null }[] | null)?.email ?? null,
    }));
    table = kind === "xero" ? xeroRows(invoices, vat) : invoiceRows(invoices, vat);
  }

  const name = `${kind === "xero" ? "xero-invoices" : kind}-${period.key}.csv`;
  return new NextResponse(toCsv(table.headers, table.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

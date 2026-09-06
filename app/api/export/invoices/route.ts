import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { formatGBP } from "@/lib/format";

// Same trust model as app/api/export/leads/route.ts - RLS decides what
// comes back, tenantId just narrows the request.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const { data: invoices } = await supabase
    .from("invoices")
    .select("client_name, reference, amount_pence, due_date, status")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: true });

  const csv = toCsv(
    ["Client", "Reference", "Amount", "Due date", "Status"],
    (invoices ?? []).map((i) => [
      i.client_name,
      i.reference,
      formatGBP(i.amount_pence),
      new Date(i.due_date).toLocaleDateString("en-GB"),
      i.status,
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices.csv"`,
    },
  });
}

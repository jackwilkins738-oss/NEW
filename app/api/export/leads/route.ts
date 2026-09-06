import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

// RLS ("member can read own leads", see supabase/schema.sql) is what
// actually decides what comes back here - the tenantId query param only
// narrows which tenant's leads to ask for, same trust model as every
// other authenticated read in this app.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const { data: leads } = await supabase
    .from("leads")
    .select("created_at, name, email, phone, source, status, message")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const csv = toCsv(
    ["Date", "Name", "Email", "Phone", "Source", "Status", "Message"],
    (leads ?? []).map((l) => [
      new Date(l.created_at).toLocaleDateString("en-GB"),
      l.name,
      l.email,
      l.phone,
      l.source,
      l.status,
      l.message,
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads.csv"`,
    },
  });
}

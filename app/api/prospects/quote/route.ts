import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { createProspectQuote } from "@/lib/prospectQuote";

// "They're interested - send them a quote." Called by the owner's local
// control panel (never a browser), behind the same service secret as the
// prospect import. In one step it records the prospect as a lead (status
// "quoted"), creates a numbered quote linked to it and marks it sent, and
// moves the prospect to "replied". Nothing is emailed from here: the panel
// hands the owner the quote link to send personally.
//
// The terms travel with the quote - the customer signs "including its terms",
// so a quote with none would bind them to nothing. The panel sends Scalar's
// terms of business; if it doesn't, the tenant's saved defaults are used.
//
// The link is built on this app's own origin - the quote pages live here -
// rather than the tenant's domain.

export async function POST(request: Request) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const out = await createProspectQuote(createAdminClient(), body, new URL(request.url).origin);
  return NextResponse.json(out.json, { status: out.status });
}

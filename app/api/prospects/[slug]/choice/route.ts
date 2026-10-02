import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";

// A one-tap answer from a prospect's preview page (migration 059): "ring me",
// "WhatsApp me" or "not for me right now". Called by the Scalar website's own
// server, which then texts the owner; returns the firm's name so that alert
// never repeats anything the request said.
const CHOICES = new Set(["call", "whatsapp", "not_now"]);

export async function POST(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const choice = String(body.choice ?? "");
  if (!CHOICES.has(choice)) return NextResponse.json({ error: "Unknown choice" }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("record_prospect_choice", { p_slug: slug, p_choice: choice });
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ prospect: row });
}

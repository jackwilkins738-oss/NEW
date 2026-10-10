import { NextResponse } from "next/server";
import { unsubscribeCustomer } from "@/lib/unsubscribe";

// One-click unsubscribe (RFC 8058): mail apps POST here from their own "Unsubscribe" button.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const done = await unsubscribeCustomer(token);
  return NextResponse.json(done ? { ok: true } : { error: "Not found" }, { status: done ? 200 : 404 });
}

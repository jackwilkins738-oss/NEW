import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { sendEnquiryNudges } from "@/lib/enquiryNudge";

// Hourly jobs. Called by .github/workflows/hourly.yml rather than a Vercel
// cron: Vercel's free plan only allows daily crons, and an hourly entry in
// vercel.json would fail every deploy on it. Same CRON_SECRET bearer as the
// Vercel crons.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const nudges = await sendEnquiryNudges().catch((err) => {
    console.error("Enquiry nudges failed:", err);
    Sentry.captureException(err);
    return { checked: 0, sent: 0 };
  });
  return NextResponse.json({ ok: true, nudges });
}

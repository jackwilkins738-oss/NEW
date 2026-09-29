// The £39/month dashboard fee, as a Stripe subscription on Scalar Digital's
// own Stripe account (not a tenant's connected one). The client adds a card
// whenever suits - at launch is best - and the first charge waits until
// their free period ends, so month 13 bills itself.

import { addMonths } from "@/lib/aftercare";
import { todayInUK } from "@/lib/ukDate";

export const DASHBOARD_MONTHLY_PENCE = 3900;
// Stripe allows a trial of up to 730 days; stay clear of the edge.
const MAX_TRIAL_DAYS = 725;
const DAY_MS = 86_400_000;

/**
 * When billing should start, as a Stripe trial_end (unix seconds), or null to
 * start at once (the free period is over or was never set). An error when the
 * free period ends too far away for Stripe - make the link nearer the time.
 */
export function billingStart(
  launchedOn: string | null,
  freeMonths: number,
  now: Date = new Date()
): { trialEnd: number | null; startsOn: string } | { error: string } {
  const today = todayInUK(now);
  if (!launchedOn || freeMonths <= 0) return { trialEnd: null, startsOn: today };
  const ends = addMonths(launchedOn, freeMonths);
  if (ends <= today) return { trialEnd: null, startsOn: today };
  const endMs = Date.parse(`${ends}T09:00:00Z`);
  if (endMs - now.getTime() > MAX_TRIAL_DAYS * DAY_MS) {
    return { error: `Their free period runs to ${ends} - too far ahead for Stripe. Make the link after ${addMonths(ends, -23)}.` };
  }
  if (endMs - now.getTime() < 2 * DAY_MS) return { trialEnd: null, startsOn: today };
  return { trialEnd: Math.floor(endMs / 1000), startsOn: ends };
}

/** Stripe subscription status -> what /admin shows. */
export function billingStatusFor(stripeStatus: string): "active" | "trialing" | "past_due" | "cancelled" {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete") return "past_due";
  return "cancelled";
}

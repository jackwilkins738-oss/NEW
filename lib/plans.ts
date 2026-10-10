// The care plans (migration 064) - kept free of server code so the /admin
// plan picker can use them in the browser. Billing is in lib/billing.ts.

export type Plan = "care" | "growth" | "pro";
export type PlanFeature = "dashboard" | "site_care" | "review_requests" | "review_replies" | "google_posts" | "seo_pages" | "missed_calls" | "campaigns";

export const PLANS: Record<Plan, { name: string; pence: number; features: PlanFeature[] }> = {
  care: { name: "Care", pence: 3900, features: ["dashboard", "site_care", "review_requests"] },
  growth: {
    name: "Growth",
    pence: 14900,
    features: ["dashboard", "site_care", "review_requests", "review_replies", "google_posts", "seo_pages", "campaigns"],
  },
  pro: {
    name: "Pro",
    pence: 24900,
    features: ["dashboard", "site_care", "review_requests", "review_replies", "google_posts", "seo_pages", "missed_calls", "campaigns"],
  },
};

/** A stored plan value -> a plan, treating anything unknown (or the column not yet added) as Care. */
export function planOf(value: unknown): Plan {
  return value === "growth" || value === "pro" ? value : "care";
}

export function planIncludes(plan: unknown, feature: PlanFeature): boolean {
  return PLANS[planOf(plan)].features.includes(feature);
}

/** "Growth - £149/month" */
export function planLabel(plan: unknown): string {
  const p = PLANS[planOf(plan)];
  return `${p.name} - £${p.pence / 100}/month`;
}

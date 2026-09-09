// Rolls every variation across the tenant (not just one project at a time,
// which is all the per-project VariationsPanel shows) into: how much money
// is sitting in pending approval right now, how much got approved and how
// fast, and a ranked list of what's waiting - the "unapproved work value"
// headline the per-project view has no way to surface on its own.
export type RegisterVariation = {
  id: string;
  number: string | null;
  project_id: string;
  project_client_name: string;
  customer_price_pence: number;
  status: string; // pending | approved | declined
  created_at: string;
  approved_at: string | null;
};

export type PendingVariationRow = {
  id: string;
  number: string | null;
  projectId: string;
  projectClientName: string;
  valuePence: number;
  daysWaiting: number;
};

export type VariationRegisterSummary = {
  pendingValuePence: number;
  pendingCount: number;
  approvedValuePence: number;
  approvedCount: number;
  declinedCount: number;
  avgApprovalDays: number | null;
  pendingRows: PendingVariationRow[];
};

export function summarizeVariations(variations: RegisterVariation[], today: Date = new Date()): VariationRegisterSummary {
  let pendingValuePence = 0;
  let pendingCount = 0;
  let approvedValuePence = 0;
  let approvedCount = 0;
  let declinedCount = 0;
  let approvalDaysTotal = 0;
  let approvalDaysCount = 0;
  const pendingRows: PendingVariationRow[] = [];

  for (const v of variations) {
    if (v.status === "pending") {
      pendingValuePence += v.customer_price_pence;
      pendingCount += 1;
      const created = new Date(v.created_at);
      const daysWaiting = Math.max(0, Math.round((today.getTime() - created.getTime()) / 86_400_000));
      pendingRows.push({
        id: v.id,
        number: v.number,
        projectId: v.project_id,
        projectClientName: v.project_client_name,
        valuePence: v.customer_price_pence,
        daysWaiting,
      });
    } else if (v.status === "approved") {
      approvedValuePence += v.customer_price_pence;
      approvedCount += 1;
      if (v.approved_at) {
        const days = (new Date(v.approved_at).getTime() - new Date(v.created_at).getTime()) / 86_400_000;
        approvalDaysTotal += days;
        approvalDaysCount += 1;
      }
    } else if (v.status === "declined") {
      declinedCount += 1;
    }
  }

  pendingRows.sort((a, b) => b.valuePence - a.valuePence);

  return {
    pendingValuePence,
    pendingCount,
    approvedValuePence,
    approvedCount,
    declinedCount,
    avgApprovalDays: approvalDaysCount > 0 ? approvalDaysTotal / approvalDaysCount : null,
    pendingRows,
  };
}

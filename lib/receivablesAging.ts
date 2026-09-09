import { todayInUK, daysBetweenUK } from "@/lib/ukDate";

// Buckets unpaid/part-paid invoices by how overdue they are, instead of
// the dashboard's previous single "overdue" total - a £500 invoice a
// week late and a £500 invoice three months late carry very different
// collection risk, and a flat total hides that.
export type AgingInvoice = {
  amount_pence: number;
  paid_pence: number | null;
  due_date: string;
  status: string;
};

export type AgingBucket = { label: string; totalPence: number; count: number };

export type ReceivablesAging = {
  current: AgingBucket;
  days1to30: AgingBucket;
  days31to60: AgingBucket;
  days61to90: AgingBucket;
  over90: AgingBucket;
  totalOutstandingPence: number;
};

export function computeReceivablesAging(invoices: AgingInvoice[], today: Date = new Date()): ReceivablesAging {
  const todayStr = todayInUK(today);

  const buckets: ReceivablesAging = {
    current: { label: "Not yet due", totalPence: 0, count: 0 },
    days1to30: { label: "1-30 days", totalPence: 0, count: 0 },
    days31to60: { label: "31-60 days", totalPence: 0, count: 0 },
    days61to90: { label: "61-90 days", totalPence: 0, count: 0 },
    over90: { label: "90+ days", totalPence: 0, count: 0 },
    totalOutstandingPence: 0,
  };

  for (const inv of invoices) {
    if (inv.status === "paid") continue;
    const outstanding = inv.amount_pence - (inv.paid_pence ?? 0);
    if (outstanding <= 0) continue;

    const daysOverdue = daysBetweenUK(inv.due_date, todayStr);

    const bucket =
      daysOverdue <= 0
        ? buckets.current
        : daysOverdue <= 30
          ? buckets.days1to30
          : daysOverdue <= 60
            ? buckets.days31to60
            : daysOverdue <= 90
              ? buckets.days61to90
              : buckets.over90;

    bucket.totalPence += outstanding;
    bucket.count += 1;
    buckets.totalOutstandingPence += outstanding;
  }

  return buckets;
}

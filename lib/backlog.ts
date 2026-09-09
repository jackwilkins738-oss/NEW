// "Backlog" = contracted value not yet completed, bucketed by the month
// each project is targeted to finish - shows whether future workload is
// balanced or piling up in one month, which a single backlog total can't.
// Deliberately separate from the dashboard's "Live pipeline value" hero
// tile (on_track/at_risk only, no monthly breakdown) - this includes every
// active project regardless of status, since a delayed job is still
// backlog, just at-risk backlog.
import { todayInUK } from "@/lib/ukDate";

export type BacklogProject = { value_pence: number | null; completed_at: string | null; target_date: string | null };

export type BacklogBucket = { label: string; value: number; detail: string };

export type BacklogSummary = {
  totalBacklogPence: number;
  projectCount: number;
  buckets: BacklogBucket[];
  noTargetDatePence: number;
};

export function computeBacklogByMonth(
  projects: BacklogProject[],
  monthsAhead: number = 6,
  today: Date = new Date()
): BacklogSummary {
  const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const active = projects.filter((p) => !p.completed_at && p.value_pence != null);

  // UK calendar year/month, not the server's own local getFullYear/getMonth
  // (always UTC on Vercel) - matters right at a month boundary near
  // midnight BST, where UTC can still be in the previous month.
  const [todayYear, todayMonth] = todayInUK(today).split("-").map(Number);
  const buckets: { key: string; label: string; value: number; count: number }[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(todayYear, todayMonth - 1 + i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTH_LABEL[d.getMonth()]} ${d.getFullYear()}`, value: 0, count: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const beyond = { label: "Beyond", value: 0, count: 0 };

  let noTargetDatePence = 0;

  for (const p of active) {
    const value = p.value_pence ?? 0;
    if (!p.target_date) {
      noTargetDatePence += value;
      continue;
    }
    const [targetYear, targetMonth] = p.target_date.split("-").map(Number);
    const key = `${targetYear}-${targetMonth - 1}`;
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.value += value;
      bucket.count += 1;
    } else {
      beyond.value += value;
      beyond.count += 1;
    }
  }

  const allBuckets = beyond.count > 0 ? [...buckets, beyond] : buckets;

  return {
    totalBacklogPence: active.reduce((sum, p) => sum + (p.value_pence ?? 0), 0),
    projectCount: active.length,
    buckets: allBuckets.map((b) => ({
      label: b.label,
      value: b.value / 100,
      detail: `${b.count} project${b.count === 1 ? "" : "s"}`,
    })),
    noTargetDatePence,
  };
}

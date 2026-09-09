// Same treatment as the variation register: snags/defects only show up one
// project at a time in the per-project SnagsPanel, so there's nowhere to
// see "how much open defect work is there across the whole business right
// now" - this rolls every open snag into one ranked list plus a few
// portfolio counts.
export type RegisterSnag = {
  id: string;
  description: string;
  project_id: string;
  project_client_name: string;
  assigned_to: string | null;
  due_date: string | null;
  status: string; // open | assigned | complete
  created_at: string;
};

export type OpenSnagRow = {
  id: string;
  description: string;
  projectId: string;
  projectClientName: string;
  assignedTo: string | null;
  daysOpen: number;
  overdue: boolean;
};

export type SnagRegisterSummary = {
  openCount: number;
  overdueCount: number;
  completeCount: number;
  unassignedCount: number;
  openRows: OpenSnagRow[];
};

export function summarizeSnags(snags: RegisterSnag[], today: Date = new Date()): SnagRegisterSummary {
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);

  let overdueCount = 0;
  let completeCount = 0;
  let unassignedCount = 0;
  const openRows: OpenSnagRow[] = [];

  for (const s of snags) {
    if (s.status === "complete") {
      completeCount += 1;
      continue;
    }

    const overdue = !!s.due_date && new Date(s.due_date + "T00:00:00") < todayMidnight;
    if (overdue) overdueCount += 1;
    if (!s.assigned_to) unassignedCount += 1;

    const created = new Date(s.created_at);
    const daysOpen = Math.max(0, Math.round((todayMidnight.getTime() - created.getTime()) / 86_400_000));

    openRows.push({
      id: s.id,
      description: s.description,
      projectId: s.project_id,
      projectClientName: s.project_client_name,
      assignedTo: s.assigned_to,
      daysOpen,
      overdue,
    });
  }

  openRows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.daysOpen - a.daysOpen;
  });

  return { openCount: openRows.length, overdueCount, completeCount, unassignedCount, openRows };
}

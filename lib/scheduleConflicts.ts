// Flags a team member assigned to two active projects whose date ranges
// overlap - "double-booked" in the sense that actually matters here:
// nobody can genuinely be on two different jobs' active window at once.
// Deliberately date-range based (start_date -> target_date), not a
// specific-day/time calendar - that's the only scheduling signal this app
// actually has per project, no per-person daily rota exists to check
// against. A project missing either date is skipped entirely rather than
// guessed at.
export type ConflictProject = {
  id: string;
  client_name: string;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
};

export type TeamAssignment = { projectId: string; teamMemberId: string; teamMemberName: string };

export type ScheduleConflict = {
  teamMemberName: string;
  projectAId: string;
  projectAName: string;
  projectBId: string;
  projectBName: string;
  overlapStart: string;
  overlapEnd: string;
};

export function computeScheduleConflicts(assignments: TeamAssignment[], projects: ConflictProject[]): ScheduleConflict[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const byMember = new Map<string, TeamAssignment[]>();
  for (const a of assignments) {
    const project = projectById.get(a.projectId);
    if (!project || project.completed_at || !project.start_date || !project.target_date) continue;
    const list = byMember.get(a.teamMemberId) ?? [];
    list.push(a);
    byMember.set(a.teamMemberId, list);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const memberAssignments of byMember.values()) {
    for (let i = 0; i < memberAssignments.length; i++) {
      for (let j = i + 1; j < memberAssignments.length; j++) {
        const projA = projectById.get(memberAssignments[i].projectId)!;
        const projB = projectById.get(memberAssignments[j].projectId)!;
        const overlapStart = projA.start_date! > projB.start_date! ? projA.start_date! : projB.start_date!;
        const overlapEnd = projA.target_date! < projB.target_date! ? projA.target_date! : projB.target_date!;
        if (overlapStart <= overlapEnd) {
          conflicts.push({
            teamMemberName: memberAssignments[i].teamMemberName,
            projectAId: projA.id,
            projectAName: projA.client_name,
            projectBId: projB.id,
            projectBName: projB.client_name,
            overlapStart,
            overlapEnd,
          });
        }
      }
    }
  }

  return conflicts;
}

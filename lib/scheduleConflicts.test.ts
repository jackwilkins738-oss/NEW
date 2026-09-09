import { describe, it, expect } from "vitest";
import { computeScheduleConflicts } from "./scheduleConflicts";

function project(overrides: Partial<Parameters<typeof computeScheduleConflicts>[1][number]> = {}) {
  return {
    id: "p1",
    client_name: "Project A",
    start_date: "2026-06-01",
    target_date: "2026-06-30",
    completed_at: null,
    ...overrides,
  };
}

describe("computeScheduleConflicts", () => {
  it("flags the same team member assigned to two projects with overlapping date ranges", () => {
    const conflicts = computeScheduleConflicts(
      [
        { projectId: "p1", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p2", teamMemberId: "t1", teamMemberName: "Dave" },
      ],
      [
        project({ id: "p1", client_name: "Riverside" }),
        project({ id: "p2", client_name: "Elm Street", start_date: "2026-06-15", target_date: "2026-07-15" }),
      ]
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].teamMemberName).toBe("Dave");
    expect(conflicts[0].overlapStart).toBe("2026-06-15");
    expect(conflicts[0].overlapEnd).toBe("2026-06-30");
  });

  it("does not flag non-overlapping date ranges", () => {
    const conflicts = computeScheduleConflicts(
      [
        { projectId: "p1", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p2", teamMemberId: "t1", teamMemberName: "Dave" },
      ],
      [
        project({ id: "p1", target_date: "2026-06-10" }),
        project({ id: "p2", start_date: "2026-06-11", target_date: "2026-06-20" }),
      ]
    );
    expect(conflicts).toHaveLength(0);
  });

  it("does not flag two different team members on overlapping projects", () => {
    const conflicts = computeScheduleConflicts(
      [
        { projectId: "p1", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p2", teamMemberId: "t2", teamMemberName: "Steve" },
      ],
      [project({ id: "p1" }), project({ id: "p2" })]
    );
    expect(conflicts).toHaveLength(0);
  });

  it("skips a project missing either date", () => {
    const conflicts = computeScheduleConflicts(
      [
        { projectId: "p1", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p2", teamMemberId: "t1", teamMemberName: "Dave" },
      ],
      [project({ id: "p1", target_date: null }), project({ id: "p2" })]
    );
    expect(conflicts).toHaveLength(0);
  });

  it("skips a completed project", () => {
    const conflicts = computeScheduleConflicts(
      [
        { projectId: "p1", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p2", teamMemberId: "t1", teamMemberName: "Dave" },
      ],
      [project({ id: "p1", completed_at: "2026-06-01T00:00:00Z" }), project({ id: "p2" })]
    );
    expect(conflicts).toHaveLength(0);
  });

  it("flags each overlapping pair once when a member is on three overlapping projects", () => {
    const conflicts = computeScheduleConflicts(
      [
        { projectId: "p1", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p2", teamMemberId: "t1", teamMemberName: "Dave" },
        { projectId: "p3", teamMemberId: "t1", teamMemberName: "Dave" },
      ],
      [project({ id: "p1" }), project({ id: "p2" }), project({ id: "p3" })]
    );
    expect(conflicts).toHaveLength(3);
  });
});

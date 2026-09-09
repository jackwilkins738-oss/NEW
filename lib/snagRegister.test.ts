import { describe, it, expect } from "vitest";
import { summarizeSnags } from "./snagRegister";

const TODAY = new Date("2026-06-15T00:00:00Z");

describe("summarizeSnags", () => {
  it("counts a complete snag separately and excludes it from open rows", () => {
    const s = summarizeSnags(
      [{ id: "1", description: "Paint touch-up", project_id: "p1", project_client_name: "A", assigned_to: "Dave", due_date: null, status: "complete", created_at: "2026-06-01T00:00:00Z" }],
      TODAY
    );
    expect(s.completeCount).toBe(1);
    expect(s.openRows).toHaveLength(0);
  });

  it("flags an open snag past its due date as overdue", () => {
    const s = summarizeSnags(
      [{ id: "1", description: "Leak", project_id: "p1", project_client_name: "A", assigned_to: "Dave", due_date: "2026-06-01", status: "open", created_at: "2026-05-20T00:00:00Z" }],
      TODAY
    );
    expect(s.overdueCount).toBe(1);
    expect(s.openRows[0].overdue).toBe(true);
  });

  it("does not flag an open snag with no due date as overdue", () => {
    const s = summarizeSnags(
      [{ id: "1", description: "Snag", project_id: "p1", project_client_name: "A", assigned_to: "Dave", due_date: null, status: "open", created_at: "2026-06-01T00:00:00Z" }],
      TODAY
    );
    expect(s.overdueCount).toBe(0);
  });

  it("counts an unassigned open snag", () => {
    const s = summarizeSnags(
      [{ id: "1", description: "Snag", project_id: "p1", project_client_name: "A", assigned_to: null, due_date: null, status: "open", created_at: "2026-06-01T00:00:00Z" }],
      TODAY
    );
    expect(s.unassignedCount).toBe(1);
  });

  it("ranks overdue snags before non-overdue, then oldest first within each group", () => {
    const s = summarizeSnags(
      [
        { id: "1", description: "New, on time", project_id: "p1", project_client_name: "A", assigned_to: "Dave", due_date: "2026-07-01", status: "open", created_at: "2026-06-10T00:00:00Z" },
        { id: "2", description: "Old overdue", project_id: "p1", project_client_name: "A", assigned_to: "Dave", due_date: "2026-06-01", status: "open", created_at: "2026-05-01T00:00:00Z" },
        { id: "3", description: "Recent overdue", project_id: "p1", project_client_name: "A", assigned_to: "Dave", due_date: "2026-06-10", status: "open", created_at: "2026-06-05T00:00:00Z" },
      ],
      TODAY
    );
    expect(s.openRows.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });
});

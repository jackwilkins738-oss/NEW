import { describe, it, expect } from "vitest";
import { computeProjectRisks } from "./projectRisk";

const TODAY = new Date("2026-06-15T12:00:00Z");

function project(overrides: Partial<Parameters<typeof computeProjectRisks>[0][number]> = {}) {
  return {
    id: "p1",
    client_name: "Riverside Residence",
    status: "on_track",
    target_date: null,
    completed_at: null,
    ...overrides,
  };
}

describe("computeProjectRisks", () => {
  it("flags an overdue invoice as critical with the outstanding amount", () => {
    const risks = computeProjectRisks(
      [project()],
      [{ project_id: "p1", amount_pence: 50000, paid_pence: 0, due_date: "2026-06-01", status: "unpaid" }],
      [],
      [],
      TODAY
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].severity).toBe("critical");
    expect(risks[0].financialImpactPence).toBe(50000);
    expect(risks[0].nextAction).toBe("Chase payment");
  });

  it("only counts the outstanding balance on a part-paid overdue invoice", () => {
    const risks = computeProjectRisks(
      [project()],
      [{ project_id: "p1", amount_pence: 50000, paid_pence: 30000, due_date: "2026-06-01", status: "part_paid" }],
      [],
      [],
      TODAY
    );
    expect(risks[0].financialImpactPence).toBe(20000);
  });

  it("ignores a paid invoice even if the due date has passed", () => {
    const risks = computeProjectRisks(
      [project()],
      [{ project_id: "p1", amount_pence: 50000, paid_pence: 50000, due_date: "2026-06-01", status: "paid" }],
      [],
      [],
      TODAY
    );
    expect(risks).toHaveLength(0);
  });

  it("ignores an invoice not yet overdue", () => {
    const risks = computeProjectRisks(
      [project()],
      [{ project_id: "p1", amount_pence: 50000, paid_pence: 0, due_date: "2026-07-01", status: "unpaid" }],
      [],
      [],
      TODAY
    );
    expect(risks).toHaveLength(0);
  });

  it("flags a project over its quoted budget as critical", () => {
    const risks = computeProjectRisks(
      [project()],
      [],
      [],
      [{ project_id: "p1", budget_pence: 100000, committed_pence: 142000 }],
      TODAY
    );
    expect(risks[0].severity).toBe("critical");
    expect(risks[0].financialImpactPence).toBe(42000);
    expect(risks[0].reasons).toContain("Over budget");
  });

  it("does not flag a project still within budget", () => {
    const risks = computeProjectRisks(
      [project()],
      [],
      [],
      [{ project_id: "p1", budget_pence: 100000, committed_pence: 80000 }],
      TODAY
    );
    expect(risks).toHaveLength(0);
  });

  it("flags a passed target date on a project still marked on_track", () => {
    const risks = computeProjectRisks([project({ target_date: "2026-06-10" })], [], [], [], TODAY);
    expect(risks[0].severity).toBe("warning");
    expect(risks[0].scheduleImpactDays).toBe(5);
    expect(risks[0].reasons).toContain("Target date passed");
  });

  it("does not double-flag a passed target date on a project already marked at_risk", () => {
    const risks = computeProjectRisks(
      [project({ status: "at_risk", target_date: "2026-06-10" })],
      [],
      [],
      [],
      TODAY
    );
    expect(risks[0].reasons).toEqual(["Marked at risk"]);
  });

  it("sums pending variation value as financial exposure with a warning severity", () => {
    const risks = computeProjectRisks(
      [project()],
      [],
      [
        { project_id: "p1", customer_price_pence: 30000, status: "pending", number: "V1" },
        { project_id: "p1", customer_price_pence: 15000, status: "pending", number: "V2" },
        { project_id: "p1", customer_price_pence: 99999, status: "approved", number: "V3" },
      ],
      [],
      TODAY
    );
    expect(risks[0].financialImpactPence).toBe(45000);
    expect(risks[0].reasons).toContain("2 variations awaiting approval");
    expect(risks[0].severity).toBe("warning");
  });

  it("excludes a completed project even with an overdue invoice", () => {
    const risks = computeProjectRisks(
      [project({ completed_at: "2026-06-01T00:00:00Z" })],
      [{ project_id: "p1", amount_pence: 50000, paid_pence: 0, due_date: "2026-06-01", status: "unpaid" }],
      [],
      [],
      TODAY
    );
    expect(risks).toHaveLength(0);
  });

  it("excludes a project with no risk factors", () => {
    const risks = computeProjectRisks([project()], [], [], [], TODAY);
    expect(risks).toHaveLength(0);
  });

  it("ranks critical projects above warnings, then by financial impact within each", () => {
    const risks = computeProjectRisks(
      [
        project({ id: "warn-small", client_name: "Small Warning", target_date: "2026-06-10" }),
        project({ id: "crit-small", client_name: "Small Critical" }),
        project({ id: "crit-big", client_name: "Big Critical" }),
      ],
      [
        { project_id: "crit-small", amount_pence: 10000, paid_pence: 0, due_date: "2026-06-01", status: "unpaid" },
        { project_id: "crit-big", amount_pence: 90000, paid_pence: 0, due_date: "2026-06-01", status: "unpaid" },
      ],
      [],
      [],
      TODAY
    );
    expect(risks.map((r) => r.projectId)).toEqual(["crit-big", "crit-small", "warn-small"]);
  });
});

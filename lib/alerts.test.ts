import { describe, it, expect } from "vitest";
import { buildAlerts } from "./alerts";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const dateDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const dateDaysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe("buildAlerts - leads", () => {
  it("flags a new lead untouched for 24h+", () => {
    const alerts = buildAlerts(
      [{ id: "1", name: "Bob", email: null, status: "new", created_at: hoursAgo(30) }],
      [],
      []
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].text).toContain("Bob");
  });

  it("does not flag a new lead under 24h old", () => {
    const alerts = buildAlerts([{ id: "1", name: "Bob", email: null, status: "new", created_at: hoursAgo(2) }], [], []);
    expect(alerts).toHaveLength(0);
  });

  it("does not flag a lead once contacted", () => {
    const alerts = buildAlerts(
      [{ id: "1", name: "Bob", email: null, status: "contacted", created_at: hoursAgo(72) }],
      [],
      []
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - invoices", () => {
  it("flags an overdue unpaid invoice as critical", () => {
    const alerts = buildAlerts(
      [],
      [{ id: "1", client_name: "Ridgeview", amount_pence: 150000, due_date: dateDaysAgo(3), status: "unpaid" }],
      []
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].text).toContain("£1,500");
  });

  it("does not flag a paid invoice even if the due date has passed", () => {
    const alerts = buildAlerts(
      [],
      [{ id: "1", client_name: "Ridgeview", amount_pence: 150000, due_date: dateDaysAgo(3), status: "paid" }],
      []
    );
    expect(alerts).toHaveLength(0);
  });

  it("does not flag an invoice not yet due", () => {
    const alerts = buildAlerts(
      [],
      [{ id: "1", client_name: "Ridgeview", amount_pence: 150000, due_date: dateDaysFromNow(3), status: "unpaid" }],
      []
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - projects", () => {
  it("flags an on_track project whose target date has slipped", () => {
    const alerts = buildAlerts(
      [],
      [],
      [{ id: "1", client_name: "Smith Extension", target_date: dateDaysAgo(2), next_visit_at: null, status: "on_track" }]
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
  });

  it("does not double-flag an at_risk project past its target date", () => {
    const alerts = buildAlerts(
      [],
      [],
      [{ id: "1", client_name: "Smith Extension", target_date: dateDaysAgo(2), next_visit_at: null, status: "at_risk" }]
    );
    expect(alerts).toHaveLength(0);
  });

  it("flags a site visit in the next 48 hours", () => {
    const alerts = buildAlerts(
      [],
      [],
      [{ id: "1", client_name: "Smith Extension", target_date: null, next_visit_at: hoursFromNow(20), status: "on_track" }]
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("info");
  });

  it("does not flag a site visit more than 48 hours out", () => {
    const alerts = buildAlerts(
      [],
      [],
      [{ id: "1", client_name: "Smith Extension", target_date: null, next_visit_at: hoursFromNow(72), status: "on_track" }]
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - quotes", () => {
  it("flags a quote sent 4+ days ago with no response", () => {
    const alerts = buildAlerts([], [], [], [{ id: "1", client_name: "Bob", quote_number: "Q-0001", status: "sent", sent_at: daysAgo(5) }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain("Q-0001");
  });

  it("does not flag a quote sent less than 4 days ago", () => {
    const alerts = buildAlerts([], [], [], [{ id: "1", client_name: "Bob", quote_number: "Q-0001", status: "sent", sent_at: daysAgo(1) }]);
    expect(alerts).toHaveLength(0);
  });

  it("does not flag a draft or accepted quote", () => {
    const alerts = buildAlerts(
      [],
      [],
      [],
      [
        { id: "1", client_name: "Bob", quote_number: "Q-0001", status: "draft", sent_at: null },
        { id: "2", client_name: "Amy", quote_number: "Q-0002", status: "accepted", sent_at: daysAgo(10) },
      ]
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - variations", () => {
  it("flags a pending variation", () => {
    const alerts = buildAlerts([], [], [], [], [{ id: "1", number: "V-001", project_client_name: "Smith Extension", status: "pending" }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain("V-001");
  });

  it("does not flag an approved or declined variation", () => {
    const alerts = buildAlerts(
      [],
      [],
      [],
      [],
      [
        { id: "1", number: "V-001", project_client_name: "Smith Extension", status: "approved" },
        { id: "2", number: "V-002", project_client_name: "Smith Extension", status: "declined" },
      ]
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - project budgets", () => {
  it("flags a project over its quoted budget", () => {
    const alerts = buildAlerts([], [], [], [], [], [{ client_name: "Smith Extension", budget_pence: 1000000, committed_pence: 1200000 }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain("£2,000");
  });

  it("does not flag a project on or under budget", () => {
    const alerts = buildAlerts([], [], [], [], [], [{ client_name: "Smith Extension", budget_pence: 1000000, committed_pence: 900000 }]);
    expect(alerts).toHaveLength(0);
  });

  it("ignores a project with no budget on record", () => {
    const alerts = buildAlerts([], [], [], [], [], [{ client_name: "Smith Extension", budget_pence: 0, committed_pence: 900000 }]);
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - pending reviews", () => {
  it("flags a review still in 'requested' status", () => {
    const alerts = buildAlerts([], [], [], [], [], [], [{ id: "1", customer_name: "Bob", project_client_name: "Smith Extension", status: "requested" }]);
    expect(alerts).toHaveLength(1);
  });

  it("does not flag a received review", () => {
    const alerts = buildAlerts([], [], [], [], [], [], [{ id: "1", customer_name: "Bob", project_client_name: "Smith Extension", status: "received" }]);
    expect(alerts).toHaveLength(0);
  });
});

describe("buildAlerts - ordering", () => {
  it("sorts critical before warning before info", () => {
    const alerts = buildAlerts(
      [{ id: "1", name: "Bob", email: null, status: "new", created_at: hoursAgo(30) }], // warning
      [{ id: "1", client_name: "Ridgeview", amount_pence: 100, due_date: dateDaysAgo(1), status: "unpaid" }], // critical
      [{ id: "1", client_name: "Smith Extension", target_date: null, next_visit_at: hoursFromNow(10), status: "on_track" }] // info
    );
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warning", "info"]);
  });

  it("sorts same-severity alerts by nearest due date first", () => {
    const alerts = buildAlerts(
      [],
      [
        { id: "1", client_name: "Later", amount_pence: 100, due_date: dateDaysAgo(1), status: "unpaid" },
        { id: "2", client_name: "Sooner", amount_pence: 100, due_date: dateDaysAgo(10), status: "unpaid" },
      ],
      []
    );
    expect(alerts.map((a) => a.text)).toEqual([expect.stringContaining("Sooner"), expect.stringContaining("Later")]);
  });
});

describe("buildAlerts - owner and drill-down", () => {
  it("attaches the project's pm and id to an overdue invoice alert", () => {
    const alerts = buildAlerts(
      [],
      [{ id: "1", client_name: "Ridgeview", amount_pence: 100, due_date: dateDaysAgo(1), status: "unpaid", project_id: "proj-1" }],
      [{ id: "proj-1", client_name: "Ridgeview", target_date: null, next_visit_at: null, status: "on_track", pm: "Dave" }]
    );
    expect(alerts[0].projectId).toBe("proj-1");
    expect(alerts[0].ownerName).toBe("Dave");
  });

  it("leaves owner and projectId null when an invoice has no linked project", () => {
    const alerts = buildAlerts(
      [],
      [{ id: "1", client_name: "Ridgeview", amount_pence: 100, due_date: dateDaysAgo(1), status: "unpaid" }],
      []
    );
    expect(alerts[0].projectId).toBeNull();
    expect(alerts[0].ownerName).toBeNull();
  });
});

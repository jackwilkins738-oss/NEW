import { describe, it, expect } from "vitest";
import { computeDataQualityWarnings } from "./dataQuality";

describe("computeDataQualityWarnings", () => {
  it("flags an active project with no value set", () => {
    const w = computeDataQualityWarnings(
      [{ id: "p1", client_name: "A", value_pence: null, quote_id: "q1", completed_at: null }],
      [],
      [{ project_id: "p1" }]
    );
    expect(w.find((x) => x.label.includes("no value set"))?.count).toBe(1);
  });

  it("flags an active project with no linked quote", () => {
    const w = computeDataQualityWarnings(
      [{ id: "p1", client_name: "A", value_pence: 100000, quote_id: null, completed_at: null }],
      [],
      [{ project_id: "p1" }]
    );
    expect(w.find((x) => x.label.includes("no linked quote"))?.count).toBe(1);
  });

  it("flags an active project with no cost items logged", () => {
    const w = computeDataQualityWarnings(
      [{ id: "p1", client_name: "A", value_pence: 100000, quote_id: "q1", completed_at: null }],
      [],
      []
    );
    expect(w.find((x) => x.label.includes("no costs logged"))?.count).toBe(1);
  });

  it("flags an invoice with no project linked", () => {
    const w = computeDataQualityWarnings([], [{ id: "i1", client_name: "A", project_id: null }], []);
    expect(w.find((x) => x.label.includes("no project linked"))?.count).toBe(1);
  });

  it("excludes completed projects from every project-based check", () => {
    const w = computeDataQualityWarnings(
      [{ id: "p1", client_name: "A", value_pence: null, quote_id: null, completed_at: "2026-01-01T00:00:00Z" }],
      [],
      []
    );
    expect(w).toHaveLength(0);
  });

  it("returns an empty list when everything is complete", () => {
    const w = computeDataQualityWarnings(
      [{ id: "p1", client_name: "A", value_pence: 100000, quote_id: "q1", completed_at: null }],
      [{ id: "i1", client_name: "A", project_id: "p1" }],
      [{ project_id: "p1" }]
    );
    expect(w).toHaveLength(0);
  });
});

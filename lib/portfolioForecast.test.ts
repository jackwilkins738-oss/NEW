import { describe, it, expect } from "vitest";
import { computePortfolioForecast } from "./portfolioForecast";

describe("computePortfolioForecast", () => {
  it("computes forecast revenue, cost, profit and margin across active projects", () => {
    const result = computePortfolioForecast(
      [
        { id: "p1", value_pence: 100000, completed_at: null },
        { id: "p2", value_pence: 200000, completed_at: null },
      ],
      [
        { project_id: "p1", amount_pence: 40000 },
        { project_id: "p2", amount_pence: 60000 },
      ]
    );
    expect(result.projectCount).toBe(2);
    expect(result.forecastRevenuePence).toBe(300000);
    expect(result.forecastCostPence).toBe(100000);
    expect(result.forecastProfitPence).toBe(200000);
    expect(result.forecastMarginPercent).toBeCloseTo((200000 / 300000) * 100);
  });

  it("excludes completed projects from both revenue and cost", () => {
    const result = computePortfolioForecast(
      [
        { id: "p1", value_pence: 100000, completed_at: null },
        { id: "p2", value_pence: 500000, completed_at: "2026-01-01T00:00:00Z" },
      ],
      [
        { project_id: "p1", amount_pence: 10000 },
        { project_id: "p2", amount_pence: 400000 },
      ]
    );
    expect(result.projectCount).toBe(1);
    expect(result.forecastRevenuePence).toBe(100000);
    expect(result.forecastCostPence).toBe(10000);
  });

  it("excludes projects with no value set", () => {
    const result = computePortfolioForecast([{ id: "p1", value_pence: null, completed_at: null }], []);
    expect(result.projectCount).toBe(0);
    expect(result.forecastRevenuePence).toBe(0);
  });

  it("returns a null margin when forecast revenue is zero", () => {
    const result = computePortfolioForecast([], []);
    expect(result.forecastMarginPercent).toBeNull();
  });

  it("ignores cost items belonging to a project outside the active set", () => {
    const result = computePortfolioForecast(
      [{ id: "p1", value_pence: 100000, completed_at: null }],
      [{ project_id: "someone-elses-project", amount_pence: 999999 }]
    );
    expect(result.forecastCostPence).toBe(0);
  });
});

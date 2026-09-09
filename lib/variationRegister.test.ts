import { describe, it, expect } from "vitest";
import { summarizeVariations } from "./variationRegister";

const TODAY = new Date("2026-06-15T00:00:00Z");

describe("summarizeVariations", () => {
  it("sums pending value and count separately from approved", () => {
    const s = summarizeVariations(
      [
        { id: "1", number: "V1", project_id: "p1", project_client_name: "Ridgeview", customer_price_pence: 30000, status: "pending", created_at: "2026-06-10T00:00:00Z", approved_at: null },
        { id: "2", number: "V2", project_id: "p1", project_client_name: "Ridgeview", customer_price_pence: 50000, status: "approved", created_at: "2026-06-01T00:00:00Z", approved_at: "2026-06-05T00:00:00Z" },
      ],
      TODAY
    );
    expect(s.pendingValuePence).toBe(30000);
    expect(s.pendingCount).toBe(1);
    expect(s.approvedValuePence).toBe(50000);
    expect(s.approvedCount).toBe(1);
  });

  it("counts declined variations without adding their value anywhere", () => {
    const s = summarizeVariations(
      [{ id: "1", number: null, project_id: "p1", project_client_name: "Ridgeview", customer_price_pence: 20000, status: "declined", created_at: "2026-06-01T00:00:00Z", approved_at: null }],
      TODAY
    );
    expect(s.declinedCount).toBe(1);
    expect(s.pendingValuePence).toBe(0);
    expect(s.approvedValuePence).toBe(0);
  });

  it("computes average approval time in days across approved variations with a date", () => {
    const s = summarizeVariations(
      [
        { id: "1", number: null, project_id: "p1", project_client_name: "A", customer_price_pence: 1000, status: "approved", created_at: "2026-06-01T00:00:00Z", approved_at: "2026-06-03T00:00:00Z" },
        { id: "2", number: null, project_id: "p1", project_client_name: "A", customer_price_pence: 1000, status: "approved", created_at: "2026-06-01T00:00:00Z", approved_at: "2026-06-07T00:00:00Z" },
      ],
      TODAY
    );
    expect(s.avgApprovalDays).toBe(4);
  });

  it("returns a null avg approval time when there are no approved variations", () => {
    const s = summarizeVariations([], TODAY);
    expect(s.avgApprovalDays).toBeNull();
  });

  it("computes days waiting for each pending row and ranks by value descending", () => {
    const s = summarizeVariations(
      [
        { id: "1", number: "V1", project_id: "p1", project_client_name: "Small", customer_price_pence: 5000, status: "pending", created_at: "2026-06-10T00:00:00Z", approved_at: null },
        { id: "2", number: "V2", project_id: "p2", project_client_name: "Big", customer_price_pence: 90000, status: "pending", created_at: "2026-06-01T00:00:00Z", approved_at: null },
      ],
      TODAY
    );
    expect(s.pendingRows.map((r) => r.projectClientName)).toEqual(["Big", "Small"]);
    expect(s.pendingRows[0].daysWaiting).toBe(14);
    expect(s.pendingRows[1].daysWaiting).toBe(5);
  });
});

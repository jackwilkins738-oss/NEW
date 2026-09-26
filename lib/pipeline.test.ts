import { describe, expect, it } from "vitest";
import { computePipelineSummary, renderPipelineHtml } from "./pipeline";

const now = new Date("2026-10-05T08:00:00Z"); // a Monday digest run
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("computePipelineSummary", () => {
  it("counts only this week's leads, grouped by source, busiest first", () => {
    const s = computePipelineSummary(
      [
        { status: "new", source: "letter", created_at: daysAgo(1) },
        { status: "new", source: "letter", created_at: daysAgo(2) },
        { status: "contacted", source: null, created_at: daysAgo(3) },
        { status: "won", source: "email", created_at: daysAgo(10) },
      ],
      [],
      now
    );
    expect(s.newLeads).toBe(3);
    expect(s.leadsBySource).toEqual([
      { source: "letter", count: 2 },
      { source: "website", count: 1 },
    ]);
    expect(s.openLeads).toBe(3);
    expect(s.hasActivity).toBe(true);
  });

  it("lists prospects who opened their preview this week, most views first", () => {
    const s = computePipelineSummary(
      [],
      [
        { business_name: "Smith Roofing", status: "viewed", view_count: 1, last_viewed_at: daysAgo(2) },
        { business_name: "Oak Lofts", status: "viewed", view_count: 3, last_viewed_at: daysAgo(1) },
        { business_name: "Old Visit Ltd", status: "viewed", view_count: 5, last_viewed_at: daysAgo(9) },
        { business_name: "Replied Co", status: "replied", view_count: 0, last_viewed_at: null },
      ],
      now
    );
    expect(s.viewedThisWeek).toEqual([
      { business_name: "Oak Lofts", view_count: 3 },
      { business_name: "Smith Roofing", view_count: 1 },
    ]);
    expect(s.prospectsTotal).toBe(4);
    expect(s.prospectsReplied).toBe(1);
  });

  it("reports no activity for a quiet week, so no email goes out for it", () => {
    const s = computePipelineSummary([{ status: "won", source: null, created_at: daysAgo(30) }], [], now);
    expect(s.hasActivity).toBe(false);
  });
});

describe("renderPipelineHtml", () => {
  it("escapes prospect names so an imported name can't inject markup", () => {
    const html = renderPipelineHtml(
      computePipelineSummary(
        [],
        [{ business_name: "<img src=x onerror=alert(1)> & Sons", status: "viewed", view_count: 2, last_viewed_at: daysAgo(1) }],
        now
      )
    );
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; Sons (2 visits)");
    expect(html).not.toContain("<img");
  });

  it("renders nothing for a tenant with no prospects and a quiet week", () => {
    expect(renderPipelineHtml(computePipelineSummary([], [], now))).toBe("");
  });
});

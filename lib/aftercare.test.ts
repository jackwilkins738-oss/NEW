import { describe, expect, it } from "vitest";
import { addMonths, aftercareRemindersFor } from "./aftercare";

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths("2026-10-01", 12)).toBe("2027-10-01");
    expect(addMonths("2026-10-01", 24)).toBe("2028-10-01");
  });
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-01-31", 13)).toBe("2028-02-29");
  });
});

describe("aftercareRemindersFor", () => {
  const t = (launched_on: string | null, free_hosting_months = 12) => ({
    business_name: "Smith Roofing",
    launched_on,
    free_hosting_months,
  });

  it("sends nothing until a launch date is set", () => {
    expect(aftercareRemindersFor([t(null)], "2026-10-08")).toEqual([]);
  });

  it("fires the day 7, 21 and 30 steps on exactly those days", () => {
    expect(aftercareRemindersFor([t("2026-10-01")], "2026-10-08")[0].text).toMatch(/^Day 7/);
    expect(aftercareRemindersFor([t("2026-10-01")], "2026-10-22")[0].text).toMatch(/^Day 21/);
    expect(aftercareRemindersFor([t("2026-10-01")], "2026-10-31")[0].text).toMatch(/^Aftercare ends/);
    expect(aftercareRemindersFor([t("2026-10-01")], "2026-10-09")).toEqual([]);
  });

  it("warns 30 and 7 days before free hosting ends, respecting 24 months for founding clients", () => {
    // 12 months from 1 Oct 2026 = 1 Oct 2027; 30 days before = 1 Sep 2027.
    expect(aftercareRemindersFor([t("2026-10-01")], "2027-09-01")[0].text).toContain("1 October 2027 (30 days)");
    expect(aftercareRemindersFor([t("2026-10-01")], "2027-09-24")[0].text).toContain("(7 days)");
    // A founding client on 24 months gets nothing at the 12-month mark.
    expect(aftercareRemindersFor([t("2026-10-01", 24)], "2027-09-01")).toEqual([]);
    expect(aftercareRemindersFor([t("2026-10-01", 24)], "2028-09-01")[0].text).toContain("1 October 2028");
  });
});

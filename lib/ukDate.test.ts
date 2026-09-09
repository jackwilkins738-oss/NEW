import { describe, it, expect } from "vitest";
import { todayInUK, isPastUK, isTodayOrPastUK, daysBetweenUK } from "./ukDate";

describe("todayInUK", () => {
  it("returns the UK calendar date, not the UTC one, during BST", () => {
    // 23:30 UTC on June 14 is 00:30 BST on June 15 - the UK's day has
    // already turned over even though UTC hasn't.
    expect(todayInUK(new Date("2026-06-14T23:30:00Z"))).toBe("2026-06-15");
  });

  it("matches UTC during GMT (winter, no offset)", () => {
    expect(todayInUK(new Date("2026-01-10T10:00:00Z"))).toBe("2026-01-10");
  });

  it("does not roll over early - 22:00 UTC in BST is still 23:00 UK, same day", () => {
    expect(todayInUK(new Date("2026-06-14T22:00:00Z"))).toBe("2026-06-14");
  });
});

describe("isPastUK / isTodayOrPastUK", () => {
  const bstLateNight = new Date("2026-06-14T23:30:00Z"); // UK date is 2026-06-15

  it("treats a date-only string one day before UK-today as past", () => {
    expect(isPastUK("2026-06-14", bstLateNight)).toBe(true);
  });

  it("does not treat UK-today itself as past", () => {
    expect(isPastUK("2026-06-15", bstLateNight)).toBe(false);
  });

  it("treats UK-today as 'today or past'", () => {
    expect(isTodayOrPastUK("2026-06-15", bstLateNight)).toBe(true);
  });

  it("does not treat tomorrow as past or today-or-past", () => {
    expect(isPastUK("2026-06-16", bstLateNight)).toBe(false);
    expect(isTodayOrPastUK("2026-06-16", bstLateNight)).toBe(false);
  });
});

describe("daysBetweenUK", () => {
  it("computes whole days between two calendar dates", () => {
    expect(daysBetweenUK("2026-06-01", "2026-06-15")).toBe(14);
  });

  it("returns a negative number when b is before a", () => {
    expect(daysBetweenUK("2026-06-15", "2026-06-01")).toBe(-14);
  });

  it("returns zero for the same date", () => {
    expect(daysBetweenUK("2026-06-15", "2026-06-15")).toBe(0);
  });
});

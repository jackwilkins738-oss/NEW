import { describe, it, expect } from "vitest";
import { formatGBP } from "./format";

describe("formatGBP", () => {
  it("formats whole pounds with the £ symbol and thousands separators", () => {
    expect(formatGBP(150000)).toBe("£1,500");
  });

  it("rounds to whole pounds (no decimal places)", () => {
    expect(formatGBP(12345)).toBe("£123");
  });

  it("formats zero as £0", () => {
    expect(formatGBP(0)).toBe("£0");
  });

  it("formats a negative amount (e.g. a refund/over-budget delta)", () => {
    expect(formatGBP(-50000)).toBe("-£500");
  });
});

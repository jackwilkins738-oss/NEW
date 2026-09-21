import { describe, it, expect } from "vitest";
import { generateRef } from "./projectRef";

describe("generateRef", () => {
  it("stamps the year and zero-padded month", () => {
    expect(generateRef(new Date(2026, 8, 21))).toMatch(/^P-202609-/);
  });

  it("pads single-digit months", () => {
    // January is month 0, and the bug this guards against is "2026-1"
    // rather than "202601".
    expect(generateRef(new Date(2026, 0, 5))).toMatch(/^P-202601-/);
  });

  it("does not pad December", () => {
    expect(generateRef(new Date(2026, 11, 31))).toMatch(/^P-202612-/);
  });

  it("ends in a 4-character uppercase suffix", () => {
    expect(generateRef(new Date(2026, 8, 21))).toMatch(/^P-\d{6}-[0-9A-Z]{4}$/);
  });

  it("varies between calls in the same month", () => {
    const when = new Date(2026, 8, 21);
    // Not a uniqueness guarantee - the suffix is for readability down the
    // phone - but a generator returning a constant would be a real bug.
    const refs = new Set(Array.from({ length: 50 }, () => generateRef(when)));
    expect(refs.size).toBeGreaterThan(1);
  });
});

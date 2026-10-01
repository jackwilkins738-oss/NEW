import { describe, expect, it } from "vitest";
import { tapCounts, tapSummary } from "./contactTaps";

describe("contact taps", () => {
  it("counts each kind and ignores anything else", () => {
    const c = tapCounts([{ kind: "call" }, { kind: "call" }, { kind: "whatsapp" }, { kind: null }, { kind: "fax" }]);
    expect(c).toEqual({ call: 2, whatsapp: 1, email: 0, total: 3 });
  });

  it("says only what happened, as taps", () => {
    expect(tapSummary({ call: 12, whatsapp: 3, email: 1, total: 16 })).toBe("12 call taps · 3 WhatsApp · 1 email");
    expect(tapSummary({ call: 1, whatsapp: 0, email: 0, total: 1 })).toBe("1 call tap");
    expect(tapSummary({ call: 0, whatsapp: 0, email: 0, total: 0 })).toBe("");
  });
});

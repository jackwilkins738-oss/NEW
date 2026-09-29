import { describe, expect, it } from "vitest";
import { cleanSignature } from "./signature";

describe("cleanSignature", () => {
  it("keeps a real name, tidied", () => {
    expect(cleanSignature("  Sarah   Kerr ")).toBe("Sarah Kerr");
    expect(cleanSignature("Zoë O'Brien-Smith")).toBe("Zoë O'Brien-Smith");
  });
  it("refuses blanks, initials-only junk and non-strings", () => {
    expect(cleanSignature("")).toBeNull();
    expect(cleanSignature("x")).toBeNull();
    expect(cleanSignature("123 !!")).toBeNull();
    expect(cleanSignature(undefined)).toBeNull();
  });
  it("caps the length", () => {
    expect(cleanSignature("a".repeat(300))!.length).toBe(100);
  });
});

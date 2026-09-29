import { describe, expect, it } from "vitest";
import { customersFromCsv, mapHeader, parseCsv } from "./customerImport";

describe("parseCsv", () => {
  it("handles quotes, commas and line breaks inside fields, and Excel's BOM", () => {
    expect(parseCsv('﻿Name,Notes\r\n"Kerr, Sam","Said ""call after 5""\nback gate"\r\n')).toEqual([
      ["Name", "Notes"],
      ["Kerr, Sam", 'Said "call after 5"\nback gate'],
    ]);
  });
  it("reads semicolon files (European Excel)", () => {
    expect(parseCsv("Name;Email\nSam;s@k.co.uk")).toEqual([["Name", "Email"], ["Sam", "s@k.co.uk"]]);
  });
});

describe("customersFromCsv", () => {
  it("maps common headers, joins first and last names, and skips duplicates and blanks", () => {
    const csv = [
      "First Name,Surname,E-mail,Mobile,Site Address,Notes",
      "Sam,Kerr,S@K.co.uk,07700 900123,1 High St,Loft",
      "Sam,Kerr,s@k.co.uk,,,",
      ",,,,,",
      "Jo,,not-an-email,,,",
    ].join("\n");
    const { customers, skipped } = customersFromCsv(csv);
    expect(customers).toEqual([
      { name: "Sam Kerr", email: "s@k.co.uk", phone: "07700 900123", address: "1 High St", notes: "Loft" },
      { name: "Jo", email: null, phone: null, address: null, notes: null },
    ]);
    expect(skipped).toBe(1);
  });
  it("explains a file it can't use", () => {
    expect(customersFromCsv("Foo,Bar\n1,2").error).toMatch(/Name or Email/);
    expect(customersFromCsv("").error).toMatch(/no customers/);
    expect(mapHeader(["Customer", "Telephone"])).toEqual({ name: 0, phone: 1 });
  });
});

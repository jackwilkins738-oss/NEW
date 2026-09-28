import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { addMonths, serviceReminderEmail, sinceLabel } from "./serviceReminders";
import { costRows, exportPeriods, invoiceRows, splitVat, xeroRows, type ExportInvoice } from "./accountsExport";

describe("service reminders", () => {
  it("adds months, clamping to the end of shorter months", () => {
    expect(addMonths("2026-10-13", 12)).toBe("2027-10-13");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("words the gap naturally and escapes the email", () => {
    expect(sinceLabel(12)).toBe("a year");
    expect(sinceLabel(24)).toBe("2 years");
    expect(sinceLabel(6)).toBe("6 months");
    const email = serviceReminderEmail("Sam <b>Lee</b>", "Kerr & Sons", "Annual boiler service", 12);
    expect(email.subject).toBe("Time to book your annual boiler service - Kerr & Sons");
    expect(email.html).toContain("It's been a year since we were last with you");
    expect(email.html).toContain("Kerr &amp; Sons");
    expect(serviceReminderEmail("Sam", "K", "EICR", null).html).toContain("It's time for your <strong>EICR</strong>");
  });
});

describe("accountant exports", () => {
  it("offers calendar quarters and UK tax years", () => {
    const p = exportPeriods("2026-04-05");
    expect(p.map((x) => [x.key, x.from, x.to])).toEqual([
      ["q-2026-2", "2026-04-01", "2026-06-30"],
      ["q-2026-1", "2026-01-01", "2026-03-31"],
      ["ty-2025", "2025-04-06", "2026-04-05"],
      ["ty-2024", "2024-04-06", "2025-04-05"],
      ["all", null, null],
    ]);
    expect(exportPeriods("2026-01-10")[1].key).toBe("q-2025-4");
    expect(exportPeriods("2026-04-06")[2].key).toBe("ty-2026");
  });

  it("splits VAT so net + VAT is exactly the gross", () => {
    expect(splitVat(120_000, 20)).toEqual({ net: 100_000, vat: 20_000 });
    expect(splitVat(99_99, 20)).toEqual({ net: 8333, vat: 1666 });
    expect(splitVat(5_000, 0)).toEqual({ net: 5_000, vat: 0 });
  });

  const inv: ExportInvoice = {
    invoice_number: "INV-0007",
    client_name: "Sarah Kerr",
    reference: "P-202610-AB12",
    milestone: "Deposit",
    amount_pence: 120_000,
    paid_pence: 0,
    status: "part_paid",
    due_date: "2026-10-20",
    created_at: "2026-10-13T09:00:00Z",
    customer_email: "s@k.co.uk",
  };

  it("fills Xero's template with UK dates and the right tax type", () => {
    const { headers, rows } = xeroRows([inv], { registered: true, ratePercent: 20 });
    const get = (h: string) => rows[0][headers.indexOf(h)];
    expect(rows[0]).toHaveLength(headers.length);
    expect(get("*ContactName")).toBe("Sarah Kerr");
    expect(get("*InvoiceDate")).toBe("13/10/2026");
    expect(get("*DueDate")).toBe("20/10/2026");
    expect(get("*UnitAmount")).toBe("1200.00");
    expect(get("*TaxType")).toBe("20% (VAT on Income)");
    expect(get("Reference")).toBe("P-202610-AB12 - Deposit");
    expect(xeroRows([inv], { registered: false, ratePercent: 20 }).rows[0][headers.indexOf("*TaxType")]).toBe("No VAT");
  });

  it("gives a plain sales list with VAT only when registered", () => {
    expect(invoiceRows([inv], { registered: true, ratePercent: 20 }).rows[0].slice(4, 9)).toEqual(["1000.00", "200.00", "1200.00", "0.00", "part paid"]);
    expect(invoiceRows([inv], { registered: false, ratePercent: 20 }).rows[0].slice(4, 7)).toEqual(["1200.00", "0.00", "1200.00"]);
  });

  it("lists costs with their job", () => {
    const { rows } = costRows([
      { cost_date: null, created_at: "2026-10-01T10:00:00Z", category: "materials", description: "Slates", supplier: "Travis Perkins", amount_pence: 45_000, status: "paid", project: "Sarah Kerr" },
    ]);
    expect(rows[0]).toEqual(["01/10/2026", "Travis Perkins", "materials", "Slates", "Sarah Kerr", "450.00", "Yes"]);
  });
});

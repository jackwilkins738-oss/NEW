// Minimal CSV writer - the column count here (a handful of fields on
// leads/invoices) doesn't justify pulling in a library. Any field
// containing a comma, quote or newline gets wrapped in quotes with
// internal quotes doubled, per the standard CSV escaping rule.
function escapeCsvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return lines.join("\r\n");
}

// Bringing a new client's existing customers across from a spreadsheet, so
// day one on the dashboard isn't retyping their address book. Accepts a CSV
// saved from Excel, Google Sheets, Numbers, or another job app's export.
// Pure, so the parsing rules are tested in one place.

export type ImportedCustomer = { name: string; email: string | null; phone: string | null; address: string | null; notes: string | null };

export const MAX_IMPORT_ROWS = 2000;

/** RFC 4180-ish: commas or semicolons, quoted fields with "" escapes and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const COLUMNS: Record<keyof ImportedCustomer | "first" | "last", RegExp> = {
  name: /^(full ?name|name|customer( name)?|client( name)?|contact( name)?|display ?name)$/,
  first: /^(first ?name|forename|given ?name)$/,
  last: /^(last ?name|surname|family ?name)$/,
  email: /^(e-?mail( address)?|email ?address)$/,
  phone: /^(phone( number)?|mobile( number)?|tel(ephone)?|telephone number|contact number)$/,
  address: /^(address|full address|address ?1|street|site address|billing address)$/,
  notes: /^(notes?|comments?|description)$/,
};

/** Which column holds what, from the header row. Null when there's no way to tell who each row is. */
export function mapHeader(header: string[]): Partial<Record<keyof typeof COLUMNS, number>> | null {
  const map: Partial<Record<keyof typeof COLUMNS, number>> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
    for (const [field, re] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, RegExp][]) {
      if (map[field] === undefined && re.test(key)) map[field] = i;
    }
  });
  return map.name !== undefined || map.first !== undefined || map.email !== undefined ? map : null;
}

const cell = (row: string[], i: number | undefined) => (i === undefined ? "" : (row[i] ?? "").replace(/\s+/g, " ").trim());

/** Rows ready to save: named (or at least emailed), each email once, capped. */
export function customersFromCsv(text: string): { customers: ImportedCustomer[]; skipped: number; error?: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { customers: [], skipped: 0, error: "That file has no customers in it." };
  const map = mapHeader(rows[0]);
  if (!map) return { customers: [], skipped: 0, error: "Couldn't find a Name or Email column in the first row." };
  const seen = new Set<string>();
  const customers: ImportedCustomer[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const emailRaw = cell(row, map.email).toLowerCase();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.slice(0, 200) : null;
    const name = (cell(row, map.name) || [cell(row, map.first), cell(row, map.last)].filter(Boolean).join(" ") || email || "").slice(0, 200);
    if (!name || (email && seen.has(email)) || customers.length >= MAX_IMPORT_ROWS) {
      skipped++;
      continue;
    }
    if (email) seen.add(email);
    customers.push({
      name,
      email,
      phone: cell(row, map.phone).slice(0, 40) || null,
      address: cell(row, map.address).slice(0, 300) || null,
      notes: cell(row, map.notes).slice(0, 1000) || null,
    });
  }
  return { customers, skipped };
}

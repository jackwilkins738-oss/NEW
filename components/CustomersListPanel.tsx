"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatGBP } from "@/lib/format";
import { PanelSearchInput } from "@/components/PanelSearchInput";
import { PanelPagination } from "@/components/PanelPagination";

const PAGE_SIZE = 20;

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  projectCount: number;
  totalValuePence: number;
};

export function CustomersListPanel({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => [c.name, c.email, c.phone].some((f) => f?.toLowerCase().includes(q)));
  }, [customers, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page_ = Math.min(page, totalPages);
  const pageItems = filtered.slice((page_ - 1) * PAGE_SIZE, page_ * PAGE_SIZE);

  return (
    <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      {customers.length > 0 && (
        <div className="mb-3 flex justify-end">
          <PanelSearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search customers…"
          />
        </div>
      )}
      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
          <p className="text-sm font-semibold text-ink">No customers yet</p>
          <p className="mt-1 px-2 text-sm text-muted">
            Convert a won lead or an accepted quote into a project and a customer record is created automatically.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No customers match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="flex flex-col">
          {pageItems.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="row-hover flex items-center justify-between gap-3 border-b border-black/8 py-3 last:border-none hover:bg-surface-2"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-muted">
                  {c.email ?? "no email"} {c.phone ? `· ${c.phone}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold text-ink">{formatGBP(c.totalValuePence)}</p>
                <p className="text-xs text-muted">
                  {c.projectCount} project{c.projectCount === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <PanelPagination page={page_} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { updateProspectStatus } from "@/app/dashboard/actions";
import { IconUsers } from "@/components/DashboardIcons";
import { PanelSearchInput } from "@/components/PanelSearchInput";
import { PanelPagination } from "@/components/PanelPagination";

// Businesses this tenant is reaching out to (migration 041) - in practice
// only Scalar Digital's own tenant has any, so the dashboard page only
// renders this panel when there's at least one. Sorted so the ones who
// just opened their preview page - the people worth ringing today - sit
// at the top.

const PAGE_SIZE = 20;

type Prospect = {
  id: string;
  slug: string;
  business_name: string;
  trade: string | null;
  area: string | null;
  website: string | null;
  mobile_score: number | null;
  channel: string;
  status: string;
  view_count: number;
  last_viewed_at: string | null;
};

const STATUS_OPTIONS = [
  { value: "new", label: "Not contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "viewed", label: "Viewed preview" },
  { value: "replied", label: "Replied" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STATUS_CLASS: Record<string, string> = {
  new: "bg-surface-2 text-ink-2",
  contacted: "bg-surface-2 text-ink-2",
  viewed: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  replied: "bg-brand-tint text-brand-strong",
  won: "bg-[rgba(12,163,12,0.15)] text-good",
  lost: "bg-[rgba(208,59,59,0.15)] text-critical",
};

function viewedLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const hours = (now - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "viewed in the last hour";
  if (hours < 24) return `viewed ${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `viewed ${days} day${days === 1 ? "" : "s"} ago`;
}

function ProspectRow({ prospect, previewBaseUrl, now }: { prospect: Prospect; previewBaseUrl: string | null; now: number }) {
  const [status, setStatus] = useState(prospect.status);
  const [isPending, startTransition] = useTransition();
  const viewed = viewedLabel(prospect.last_viewed_at, now);
  const hot = prospect.last_viewed_at && now - new Date(prospect.last_viewed_at).getTime() < 48 * 3_600_000;

  return (
    <div className="row-hover border-b border-black/8 pb-3 last:border-none last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{prospect.business_name}</p>
          <p className="text-xs text-muted">
            {[prospect.trade, prospect.area, prospect.website].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {prospect.mobile_score != null ? `Mobile score ${prospect.mobile_score}/100 · ` : ""}
            via {prospect.channel}
            {viewed ? ` · ${viewed}${prospect.view_count > 1 ? ` (${prospect.view_count} visits)` : ""}` : ""}
          </p>
        </div>
        {hot && (
          <span className="whitespace-nowrap rounded-full bg-[rgba(250,178,25,0.25)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a5a00]">
            Call today
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={status}
          disabled={isPending}
          aria-label={`Status for ${prospect.business_name}`}
          onChange={(e) => {
            const next = e.target.value;
            setStatus(next);
            startTransition(() => {
              updateProspectStatus(prospect.id, next);
            });
          }}
          className={`min-h-[32px] rounded-lg border-0 px-2.5 py-1.5 text-xs font-bold ${STATUS_CLASS[status] ?? "bg-surface-2 text-ink-2"} ${
            isPending ? "opacity-60" : ""
          }`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {previewBaseUrl && (
          <a
            href={`${previewBaseUrl}/for/${prospect.slug}?src=dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-brand hover:underline"
          >
            Open their preview
          </a>
        )}
      </div>
    </div>
  );
}

// `now` comes from the server render (one instant per request), not
// Date.now() here: render must stay pure, and the server and client
// would otherwise disagree on "viewed 3h ago" by however long hydration took.
export function ProspectsPanel({
  prospects,
  previewBaseUrl,
  now,
}: {
  prospects: Prospect[];
  previewBaseUrl: string | null;
  now: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () =>
      [...prospects].sort((a, b) => {
        const av = a.last_viewed_at ? new Date(a.last_viewed_at).getTime() : 0;
        const bv = b.last_viewed_at ? new Date(b.last_viewed_at).getTime() : 0;
        return bv - av || a.business_name.localeCompare(b.business_name);
      }),
    [prospects]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => [p.business_name, p.trade, p.area, p.website].some((f) => f?.toLowerCase().includes(q)));
  }, [sorted, query]);

  const viewedCount = prospects.filter((p) => p.view_count > 0).length;
  const repliedCount = prospects.filter((p) => p.status === "replied" || p.status === "won").length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page_ = Math.min(page, totalPages);
  const pageItems = filtered.slice((page_ - 1) * PAGE_SIZE, page_ * PAGE_SIZE);

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <IconUsers className="h-4 w-4 text-brand" />
          Prospects
        </h2>
        <p className="text-xs text-muted">
          {prospects.length} total · {viewedCount} opened their preview · {repliedCount} replied or won
        </p>
        <PanelSearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Search prospects…"
        />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No prospects match &ldquo;{query}&rdquo;.</p>
        ) : (
          pageItems.map((p) => <ProspectRow key={p.id} prospect={p} previewBaseUrl={previewBaseUrl} now={now} />)
        )}
      </div>
      <PanelPagination page={page_} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

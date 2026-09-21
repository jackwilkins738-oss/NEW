import Link from "next/link";

// Rendered by the notFound() calls in customers/[id] and projects/[id] -
// a record that was deleted, or an id belonging to another tenant that RLS
// correctly refused to return. Previously that produced the stock Next.js
// 404: unstyled, no navigation, and indistinguishable from a broken app.
//
// Inside the (app) group, so the sidebar stays and there's an obvious way
// onward.
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="rounded-2xl border border-black/8 bg-surface p-6 shadow-sm">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">404</p>
        <h1 className="mt-1.5 font-display text-xl font-extrabold text-ink">We couldn&rsquo;t find that</h1>
        <p className="mt-1.5 text-sm text-muted">
          It may have been deleted, or the link may be wrong.
        </p>
        <Link
          href="/dashboard"
          className="btn-primary mt-5 inline-block rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

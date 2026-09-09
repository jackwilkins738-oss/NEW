// Shared prev/next control - each panel owns its own page state and
// slicing (same reasoning as PanelSearchInput: every panel already has
// its own row-rendering and empty-state conventions, a generic wrapper
// would fight those more than it'd simplify). Renders nothing when
// everything fits on one page, so panels well under the page size look
// exactly as they did before this existed.
export function PanelPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-between border-t border-black/8 pt-3">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border border-black/8 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
      >
        &larr; Previous
      </button>
      <span className="text-xs text-muted">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border border-black/8 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
      >
        Next &rarr;
      </button>
    </div>
  );
}

// A sticky bar that appears once at least one row is selected - stays out
// of the way entirely otherwise (renders nothing), same "don't add chrome
// nobody's using" reasoning as PanelPagination.
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky top-2 z-10 mb-3 flex items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-tint px-3 py-2">
      <p className="text-xs font-semibold text-brand-strong">
        {count} selected
        <button type="button" onClick={onClear} className="ml-2 font-normal text-brand-strong underline hover:no-underline">
          Clear
        </button>
      </p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

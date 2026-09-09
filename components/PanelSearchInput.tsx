// Shared styling only - each panel owns its own useState/useMemo filter
// logic, since what counts as a match differs per panel (a lead searches
// name/email/phone, an invoice searches client/reference/number). Kept
// deliberately this small rather than a generic filterable-list wrapper -
// every panel here already has its own row-rendering, sorting, and
// empty-state conventions that a one-size wrapper would fight rather than
// simplify.
export function PanelSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      >
        <circle cx="8.5" cy="8.5" r="6" />
        <path d="M17 17l-4-4" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-black/15 bg-surface py-1.5 pl-8 pr-2.5 text-xs text-ink outline-none transition-colors focus:border-brand sm:w-52"
      />
    </div>
  );
}

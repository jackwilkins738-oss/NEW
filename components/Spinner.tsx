// A small inline spinner for pending server-action buttons. Kept spinning
// under prefers-reduced-motion (just slower - see .spinner in globals.css)
// rather than removed outright, since it's conveying real request state,
// not decoration.
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`spinner ${className}`} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

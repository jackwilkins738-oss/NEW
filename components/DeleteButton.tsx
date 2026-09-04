"use client";

// Small reusable confirm-then-delete button. Server Actions (unlike plain
// functions) are allowed to cross the server -> client prop boundary, so a
// Server Component can pass one straight in here.
export function DeleteButton({
  action,
  id,
  confirmText,
  className,
  label = "Delete",
}: {
  // unknown, not void | Promise<void>: some actions (like removeMembership)
  // return a result object rather than nothing, and TypeScript's void-return
  // leniency doesn't reliably cover that - this already caused one build
  // failure earlier by being too narrow. `unknown` accepts any return shape.
  action: (id: string) => unknown;
  id: string;
  confirmText: string;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm(confirmText)) action(id);
      }}
      className={className}
    >
      {label}
    </button>
  );
}

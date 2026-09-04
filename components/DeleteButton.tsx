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
  action: (id: string) => void | Promise<void>;
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

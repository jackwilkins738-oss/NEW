"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// One shared toast stack for the whole app, mounted once in the root layout
// - the same "one controller, many callers" shape as RevealController,
// rather than every mutation button growing its own inline confirmation
// message. Call sites just do `toast("Invoice marked as paid")` from inside
// a server-action transition; they don't manage timers or DOM themselves.
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Never breaks the calling component if the provider is missing for
    // some reason (e.g. a page rendered outside the root layout in a test) -
    // toasts are a nice-to-have, not something worth crashing over.
    return { toast: () => {} };
  }
  return ctx;
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-[color:color-mix(in_srgb,var(--status-good)_45%,var(--hairline))] bg-surface",
  error: "border-[color:color-mix(in_srgb,var(--status-critical)_45%,var(--hairline))] bg-surface",
  info: "border-hairline bg-surface",
};

const KIND_DOT: Record<ToastKind, string> = {
  success: "var(--status-good)",
  error: "var(--status-critical)",
  info: "var(--brand)",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-6 sm:items-end sm:pr-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className={`toast-enter pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold text-ink shadow-[0_16px_32px_-12px_rgba(23,20,15,0.35)] ${KIND_STYLES[t.kind]}`}
          >
            <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: KIND_DOT[t.kind] }} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

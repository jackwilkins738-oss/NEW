"use client";

import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/cashflow", label: "Cashflow" },
  { href: "/customers", label: "Customers" },
  { href: "/team", label: "Team" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/reviews", label: "Reviews" },
  { href: "/settings", label: "Settings" },
];

// Consolidates what used to be six separate header buttons - kept growing
// every time a new top-level page got added (Cashflow, then Customers,
// then Team...) until there was no room left, and Suppliers/Reviews never
// even got a link at all.
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-black/8 bg-surface-2 px-3 py-2.5 text-center text-sm font-semibold text-ink sm:w-auto sm:py-2"
      >
        Menu {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-black/8 bg-surface p-1.5 shadow-lg">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block rounded-md px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

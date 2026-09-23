"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconFolder,
  IconWallet,
  IconUsers,
  IconHardHat,
  IconTruck,
  IconStar,
  IconClock,
  IconSettings,
} from "@/components/DashboardIcons";

// Static route list, not a data fetch - this is "jump to a section", the
// customer/project/quote search inside each list panel already does the
// record-level lookup. Kept in sync with AppSidebar's LINKS by hand rather
// than importing from there, since AppSidebar filters by role and this is
// deliberately the unfiltered full set (a member navigating here to
// /settings is stopped by that page's own server-side check, same as
// typing the URL directly would be - this is a shortcut, not a permission
// boundary).
const ITEMS = [
  { href: "/dashboard", label: "Dashboard", hint: "Overview & KPIs", Icon: IconFolder },
  { href: "/cashflow", label: "Cashflow", hint: "Revenue & receivables", Icon: IconWallet },
  { href: "/customers", label: "Customers", hint: "Leads & accounts", Icon: IconUsers },
  { href: "/team", label: "Team", hint: "Crew & capacity", Icon: IconHardHat },
  { href: "/suppliers", label: "Suppliers", hint: "Vendors & costs", Icon: IconTruck },
  { href: "/reviews", label: "Reviews", hint: "Customer feedback", Icon: IconStar },
  { href: "/audit", label: "Audit log", hint: "Activity history", Icon: IconClock },
  { href: "/settings", label: "Settings", hint: "Business configuration", Icon: IconSettings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = ITEMS.filter((i) => (i.label + " " + i.hint).toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("scalar:open-command-palette", onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("scalar:open-command-palette", onOpenRequest);
    };
  }, []);

  // Resetting query/active here (rather than wherever setOpen(true) is
  // called) is what actually needs an effect: focusing the input has to
  // wait for the panel to exist in the DOM, which only happens after this
  // same `open` state has already committed and re-rendered - there's no
  // event handler that could reset+focus in one synchronous step instead.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Wait a tick for the panel to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]">
      <div
        aria-hidden
        className="palette-backdrop-enter absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div className="palette-panel-enter relative w-full max-w-lg overflow-hidden rounded-2xl border border-black/8 bg-surface shadow-[0_32px_64px_-20px_rgba(23,20,15,0.5)]">
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
          <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M17 17l-4-4" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && filtered[active]) {
                go(filtered[active].href);
              }
            }}
            placeholder="Jump to a section..."
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="flex-none rounded border border-black/10 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No matches.</p>}
          {filtered.map((item, i) => (
            <button
              key={item.href}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item.href)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                i === active ? "bg-brand-tint" : "hover:bg-surface-2"
              }`}
            >
              <item.Icon className="h-4 w-4 flex-none [color:var(--brand)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                <span className="block text-xs text-muted">{item.hint}</span>
              </span>
              {i === active && (
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-none text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h12M10 4l6 6-6 6" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

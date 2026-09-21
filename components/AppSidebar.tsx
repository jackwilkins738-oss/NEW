"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialsFor } from "@/lib/initials";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconFolder, IconWallet, IconUsers, IconHardHat, IconTruck, IconStar, IconClock, IconSettings } from "@/components/DashboardIcons";

// Settings and Audit log are owner-only - see the `role === "member"`
// filter below. Both pages also enforce this themselves server-side
// (a redirect), so a stale role here is a cosmetic gap at worst.
const OWNER_ONLY_HREFS = new Set(["/settings", "/audit"]);

const LINKS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconFolder },
  { href: "/cashflow", label: "Cashflow", Icon: IconWallet },
  { href: "/customers", label: "Customers", Icon: IconUsers },
  { href: "/team", label: "Team", Icon: IconHardHat },
  { href: "/suppliers", label: "Suppliers", Icon: IconTruck },
  { href: "/reviews", label: "Reviews", Icon: IconStar },
  { href: "/audit", label: "Audit log", Icon: IconClock },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

// Always a dark, brand-tinted panel regardless of the site's own light/dark
// mode - color-mix against black (not var(--ink), which flips meaning
// between themes) keeps it self-contained, and tinting toward var(--brand)
// ties it to whichever of the 8 palette colours this tenant picked, the
// same way the invoice/quote letterhead does. A persistent, wayfinding
// sidebar (rather than a "Menu ▾" dropdown that only grew because pages
// kept getting added to it) is most of what separates a considered product
// shell from a generic admin template.
const SIDEBAR_BG =
  "linear-gradient(175deg, color-mix(in srgb, black 83%, var(--brand) 17%), color-mix(in srgb, black 91%, var(--brand) 9%))";

export function AppSidebar({
  businessName,
  logoUrl,
  signOutAction,
  role = "owner",
}: {
  businessName: string;
  logoUrl: string | null;
  signOutAction: () => void;
  // Defaults to "owner" (full nav) rather than making every call site pass
  // it - a page that hasn't been updated to fetch the real role shows the
  // Settings link same as always, matching pre-roles behaviour exactly.
  // Settings itself still enforces the real restriction server-side
  // regardless of what this prop says, so a stale default is a cosmetic
  // gap at worst, never a security one.
  role?: "owner" | "member";
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = role === "member" ? LINKS.filter((l) => !OWNER_ONLY_HREFS.has(l.href)) : LINKS;

  const drawerRef = useRef<HTMLDivElement>(null);
  // Remembered so focus can go back to the hamburger when the drawer closes,
  // rather than being dumped at the top of the document.
  const openerRef = useRef<HTMLButtonElement>(null);

  // Everything a slide-over owes a keyboard or screen-reader user: Escape
  // closes it, Tab cycles inside it instead of wandering into the page
  // behind it, focus lands in it on open and returns to the opener on
  // close, and the page underneath doesn't scroll while it's covered.
  useEffect(() => {
    if (!mobileOpen) return;

    const drawer = drawerRef.current;
    const focusables = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []
      );

    focusables()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      // Wrap at whichever end we've run off, so focus never escapes into
      // the content behind the overlay.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [mobileOpen]);

  const brandMark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className="h-10 w-10 flex-none rounded-xl border border-white/15 bg-white object-contain p-1.5" />
  ) : (
    <div
      className="flex h-10 w-10 flex-none items-center justify-center rounded-xl font-display text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
      style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
    >
      {initialsFor(businessName)}
    </div>
  );

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-3">
        {brandMark}
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-bold leading-tight text-white">{businessName}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Operations</p>
        </div>
      </div>

      <nav className="mt-7 flex flex-1 flex-col gap-0.5 px-2">
        {links.map(({ href, label, Icon }) => {
          const active = pathname === href || (href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              // Tells a screen reader which page it's already on - the
              // white-on-white-10% highlight conveys that visually, and this
              // is the non-visual half of the same signal.
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                active ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`h-[17px] w-[17px] flex-none ${active ? "text-brand-strong" : "opacity-70"}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 px-2">
        <ThemeToggle />
      </div>

      <form action={signOutAction} className="px-2 pb-1">
        <button
          type="submit"
          className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white/45 transition-colors hover:bg-white/5 hover:text-white"
        >
          Sign out
        </button>
      </form>
    </>
  );

  return (
    <>
      {/* Mobile top bar - the persistent rail collapses to this + a
          slide-over drawer below sm, same breakpoint every other
          responsive layout in this app already uses. */}
      <div className="flex items-center justify-between border-b border-black/8 bg-surface px-4 py-3 sm:hidden">
        <div className="flex items-center gap-2.5">
          {brandMark}
          <p className="font-display text-sm font-bold text-ink">{businessName}</p>
        </div>
        <button
          ref={openerRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-haspopup="dialog"
          className="rounded-lg border border-black/8 bg-surface-2 p-2 text-ink-2"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-scrim absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <div
            ref={drawerRef}
            data-app-sidebar
            className="drawer-panel absolute inset-y-0 left-0 flex w-72 flex-col py-6"
            style={{ background: SIDEBAR_BG }}
          >
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop persistent rail */}
      <div data-app-sidebar className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col py-6 sm:flex" style={{ background: SIDEBAR_BG }}>
        {navContent}
      </div>
    </>
  );
}

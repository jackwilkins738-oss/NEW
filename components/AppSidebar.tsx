"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialsFor } from "@/lib/initials";
import { IconFolder, IconWallet, IconUsers, IconHardHat, IconTruck, IconStar, IconSettings } from "@/components/DashboardIcons";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconFolder },
  { href: "/cashflow", label: "Cashflow", Icon: IconWallet },
  { href: "/customers", label: "Customers", Icon: IconUsers },
  { href: "/team", label: "Team", Icon: IconHardHat },
  { href: "/suppliers", label: "Suppliers", Icon: IconTruck },
  { href: "/reviews", label: "Reviews", Icon: IconStar },
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
  const links = role === "member" ? LINKS.filter((l) => l.href !== "/settings") : LINKS;

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
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg border border-black/8 bg-surface-2 p-2 text-ink-2"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col py-6" style={{ background: SIDEBAR_BG }}>
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop persistent rail */}
      <div className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col py-6 sm:flex" style={{ background: SIDEBAR_BG }}>
        {navContent}
      </div>
    </>
  );
}

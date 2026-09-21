// Placeholder shapes for route-level loading states.
//
// Server components on purpose - these render as part of the Next.js
// loading.tsx boundary, which streams as static HTML before any client
// JavaScript has run. Nothing here is interactive, so there's no reason to
// ship it to the browser as a client component.
//
// The visual treatment (tinted block, travelling sheen, reduced-motion
// fallback) lives in the `.skeleton` class in app/globals.css so every
// placeholder in the app animates in step rather than each one easing
// slightly differently.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-3 ${className}`} />;
}

// One panel's worth of placeholder: the same rounded-2xl card the real
// panels use, so the page doesn't visibly re-flow when content arrives.
export function SkeletonPanel({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-black/8 bg-surface p-5 shadow-sm ${className}`}>
      <SkeletonLine className="w-32" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine
            key={i}
            // Ragged widths read as "text that hasn't arrived" - a stack of
            // identical full-width bars reads as a table, which is a
            // different promise about what's coming.
            className={i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-[82%]" : "w-[64%]"}
          />
        ))}
      </div>
    </div>
  );
}

// The page title block every authed route opens with.
export function SkeletonHeader() {
  return (
    <div className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
      <SkeletonLine className="h-5 w-44" />
      <SkeletonLine className="mt-2.5 w-64" />
    </div>
  );
}

// `aria-busy` plus a polite live region: a screen reader announces that the
// page is loading once, instead of reading out a screenful of empty divs.
export function SkeletonScreen({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading&hellip;</span>
      {children}
    </div>
  );
}

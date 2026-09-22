// Next.js loading.tsx boundaries render this instantly (no data allowed -
// that's the point) while the real server component streams in behind it,
// replacing the old "blank white flash" every route navigation used to
// have. Kept generic and parametrized rather than one bespoke skeleton per
// route: the shapes below (a KPI hero, a panel list) cover what every
// dashboard page is actually built from (see AppSidebar's LINKS), so one
// small set of pieces composes into a convincing stand-in for any of them.
// The real AppSidebar can't render here (it needs tenant data this
// boundary doesn't have), so this ships a static, unbranded rail in the
// same position/size - it disappears the instant the real page mounts.
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

function SidebarGhost() {
  return (
    <div className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 bg-page py-6 sm:flex" aria-hidden>
      <div className="flex items-center gap-3 px-3">
        <div className="h-10 w-10 flex-none animate-pulse rounded-xl bg-surface-2" />
        <Bar className="h-4 w-28" />
      </div>
      <div className="flex flex-col gap-2 px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 sm:p-6" aria-hidden>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-5">
        <div className="sm:col-span-3">
          <Bar className="h-3 w-32" />
          <Bar className="mt-2 h-9 w-40" />
          <Bar className="mt-3 h-7 w-full" />
        </div>
        <div className="sm:col-span-2">
          <Bar className="h-3 w-20" />
          <Bar className="mt-2 h-7 w-28" />
          <Bar className="mt-3 h-7 w-full" />
        </div>
      </div>
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5" aria-hidden>
      <Bar className="h-4 w-36" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Bar key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ kpi = true, panels = 2 }: { kpi?: boolean; panels?: number }) {
  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <SidebarGhost />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Bar className="h-3 w-48" />
        <Bar className="mt-2 h-8 w-64" />
        {kpi && <KpiSkeleton />}
        {Array.from({ length: panels }).map((_, i) => (
          <PanelSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}

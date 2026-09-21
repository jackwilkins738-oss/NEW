import { SkeletonLine, SkeletonPanel, SkeletonScreen } from "@/components/Skeleton";

// The dashboard's own loading state. It's the heaviest page in the app -
// twelve queries in one Promise.all - so it's the one where a blank screen
// was most obvious, and the one worth shaping precisely.
//
// The layout mirrors the real page: an eyebrow-plus-title header, the
// unified hero tile (big pipeline figure on the left, secondary stats
// strip beneath), then the stack of panels. Matching those proportions is
// the point - the page should look like it's filling in, not like it's
// being replaced by a different page.
export default function DashboardLoading() {
  return (
    <SkeletonScreen>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SkeletonLine className="h-2.5 w-56" />
            <SkeletonLine className="mt-2.5 h-7 w-72" />
          </div>
          <SkeletonLine className="h-9 w-64" />
        </header>

        {/* Hero tile: the two headline figures, then the five-stat strip. */}
        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-5">
            <div className="sm:col-span-3">
              <SkeletonLine className="w-36" />
              <SkeletonLine className="mt-2.5 h-10 w-56" />
              <SkeletonLine className="mt-2 w-40" />
              <SkeletonLine className="mt-4 h-10 w-full" />
            </div>
            <div className="sm:col-span-2 sm:border-l sm:border-black/8 sm:pl-5">
              <SkeletonLine className="w-28" />
              <SkeletonLine className="mt-2.5 h-8 w-40" />
              <SkeletonLine className="mt-2 w-32" />
              <SkeletonLine className="mt-4 h-10 w-full" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-black/8 pt-4 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <SkeletonLine className="h-4 w-4" />
                <SkeletonLine className="mt-2 w-20" />
                <SkeletonLine className="mt-1.5 h-4 w-12" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={5} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkeletonPanel lines={4} />
            <SkeletonPanel lines={4} />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}

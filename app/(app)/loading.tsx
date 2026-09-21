import { SkeletonHeader, SkeletonPanel, SkeletonScreen } from "@/components/Skeleton";

// The fallback loading state for every route in this group that doesn't
// define its own (cashflow, customers, team, suppliers, reviews, audit,
// settings and the detail pages). Each of those opens with a title card
// followed by a stack of panels, so one generic shape fits them all -
// /dashboard is different enough to get its own, next door.
//
// It renders inside app/(app)/layout.tsx, which means the sidebar stays on
// screen and only this content column swaps out. max-w-4xl is the most
// common container width across these pages; a page that's narrower simply
// settles in slightly when it arrives.
export default function Loading() {
  return (
    <SkeletonScreen>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <SkeletonHeader />
        <div className="mt-5 flex flex-col gap-4">
          <SkeletonPanel lines={4} />
          <SkeletonPanel lines={6} />
        </div>
      </div>
    </SkeletonScreen>
  );
}

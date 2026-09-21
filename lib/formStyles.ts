// Shared form field styling.
//
// These two strings were copy-pasted into 17 files, which is how the whole
// app ended up carrying `outline-none focus:border-brand` - a focus
// treatment that removed the browser's ring and replaced it with a 1px
// border colour change. Fixing that meant touching every copy; naming it
// once means the next fix is a one-line change.
//
// Note what's *not* here: no focus classes at all. The focus ring is
// handled centrally in app/globals.css (`input:focus-visible`), which gives
// every field the brand border plus a 4px tinted halo whether or not it
// uses this constant. Adding `outline-none` back here would be fighting it.

export const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink sm:text-sm";

// Roomier variant - used where a field is the primary thing on the panel
// rather than one cell in a dense row of them.
export const fieldLarge =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink transition-colors sm:text-sm";

export const label = "text-xs font-semibold text-ink-2";

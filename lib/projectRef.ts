// The human-readable reference stamped on a new project, e.g. P-202609-4K7Q.
//
// Lives in lib/ rather than beside the actions because it's needed from two
// of them (creating a project directly, and converting a lead or a quote
// into one) which now sit in different modules - and because, being pure,
// it's the only part of that flow that can be unit-tested without a
// database.
//
// The random suffix is for readability, not uniqueness: it's what someone
// reads down the phone. Nothing depends on it being unique, so there's no
// collision check.
export function generateRef(now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P-${stamp}-${suffix}`;
}

const SKIP_WORDS = new Set(["and", "the", "of", "&"]);

export function initialsFor(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !SKIP_WORDS.has(w.toLowerCase()) && /[a-z0-9]/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join("") || name.trim()[0]?.toUpperCase() || "?";
}

// The rules for photos attached to a website enquiry. Pure, so the upload
// route, the lead route and the tests share one set.

export const LEAD_PHOTO_BUCKET = "lead-photos";
export const MAX_LEAD_PHOTOS = 5;
export const MAX_LEAD_PHOTO_BYTES = 10 * 1024 * 1024; // matches the bucket (migration 053)
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Why these files can't be uploaded, or null. */
export function photosProblem(files: unknown): string | null {
  if (!Array.isArray(files) || files.length === 0) return "No photos.";
  if (files.length > MAX_LEAD_PHOTOS) return `Up to ${MAX_LEAD_PHOTOS} photos.`;
  for (const f of files) {
    const type = (f as { type?: unknown })?.type;
    const size = Number((f as { size?: unknown })?.size);
    if (typeof type !== "string" || !TYPES[type]) return "Photos must be JPG, PNG, WebP or HEIC.";
    if (!(size > 0) || size > MAX_LEAD_PHOTO_BYTES) return "Each photo must be under 10 MB.";
  }
  return null;
}

export function photoExtension(type: string): string {
  return TYPES[type] ?? "jpg";
}

/** The paths a lead may claim: this tenant's pending uploads only, each once, at most five. */
export function claimablePaths(tenantId: string, paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  const re = new RegExp(`^${tenantId}/pending/[0-9a-f-]{36}\\.(jpg|png|webp|heic|heif)$`);
  return [...new Set(paths.filter((p): p is string => typeof p === "string" && re.test(p)))].slice(0, MAX_LEAD_PHOTOS);
}

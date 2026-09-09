"use client";

import { useRef, useState, useTransition } from "react";
import { uploadProjectPhoto, deleteProjectPhoto } from "@/app/dashboard/actions";

type Photo = {
  id: string;
  storage_path: string;
  caption: string | null;
  project_id: string | null;
  created_at: string;
};

type ProjectOption = { id: string; client_name: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function publicPhotoUrl(storagePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/project-photos/${storagePath}`;
}

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export function ProjectPhotosPanel({
  tenantId,
  photos,
  projects,
}: {
  tenantId: string;
  photos: Photo[];
  projects: ProjectOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await uploadProjectPhoto(formData);
      formRef.current?.reset();
    });
  }

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Currently on site</h2>
      <p className="text-xs text-muted">
        Photos here show up on your live website automatically, newest first - no need to ask us to update anything.
      </p>

      <form
        ref={formRef}
        action={handleSubmit}
        className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/8 bg-surface-2 p-3 sm:grid-cols-4 sm:items-end"
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <label className={`${label} sm:col-span-2`}>
          Photo
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic" required className={field} />
        </label>
        <label className={label}>
          Caption
          <input name="caption" className={field} placeholder="e.g. Rear dormer, week 3 - steels going in" />
        </label>
        <label className={label}>
          Link to project (optional)
          <select name="projectId" defaultValue="" className={field}>
            <option value="">Not linked</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client_name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60 sm:col-span-4 sm:py-1.5"
        >
          {isPending ? "Uploading…" : "Add photo"}
        </button>
      </form>

      {photos.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-black/15 py-8 text-center">
          <p className="text-sm font-semibold text-ink">No photos yet</p>
          <p className="mt-1 text-sm text-muted">
            Add one above - it won&apos;t show on your site until there&apos;s at least one.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoCard({ photo }: { photo: Photo }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-black/8 bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset */}
      <img src={publicPhotoUrl(photo.storage_path)} alt={photo.caption ?? ""} className="aspect-[4/3] w-full object-cover" />
      {photo.caption && <p className="truncate p-1.5 text-xs text-ink-2">{photo.caption}</p>}
      {confirming ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-2 text-center">
          <p className="text-xs font-semibold text-white">Delete this photo?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => deleteProjectPhoto(photo.id, photo.storage_path)}
              className="rounded-lg bg-critical px-2.5 py-1 text-xs font-bold text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-white/40 px-2.5 py-1 text-xs font-semibold text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="absolute right-1.5 top-1.5 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          Delete
        </button>
      )}
    </div>
  );
}

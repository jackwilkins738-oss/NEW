"use client";

import { useState, useTransition } from "react";
import { saveJobPost } from "@/app/posts/actions";
import { CopyButton } from "@/components/CopyButton";

export type JobPostView = {
  id: string;
  status: string;
  title: string;
  body: string;
  google_post: string;
  photos: { url: string; alt: string }[];
  page_url: string | null;
  google_post_name?: string | null;
};

const field = "w-full rounded-lg border border-black/15 bg-surface px-3 py-2 text-sm text-ink";

export function JobPostCard({ post }: { post: JobPostView }) {
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [google, setGoogle] = useState(post.google_post);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editable = post.status === "draft" || post.status === "approved";
  const save = (status: "draft" | "approved" | "skipped") =>
    start(async () => {
      const r = await saveJobPost(post.id, { title, body, google_post: google }, status);
      setMsg("error" in r ? r.error : status === "approved" ? "Approved - it goes on your website tomorrow morning." : status === "skipped" ? "Skipped." : "Saved.");
    });

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      {post.photos.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {post.photos.slice(0, 4).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.url} src={p.url} alt={p.alt} className="h-24 w-32 flex-none rounded-lg object-cover" loading="lazy" />
          ))}
        </div>
      )}
      {editable ? (
        <div className="grid gap-3">
          <label className="text-xs font-semibold text-muted">
            Page title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={`mt-1 ${field}`} />
          </label>
          <label className="text-xs font-semibold text-muted">
            The write-up for your website - correct anything that isn&apos;t quite right
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={6000} className={`mt-1 ${field}`} />
          </label>
          <label className="text-xs font-semibold text-muted">
            Post for your Google profile
            <textarea value={google} onChange={(e) => setGoogle(e.target.value)} rows={4} maxLength={1500} className={`mt-1 ${field}`} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => save("approved")}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {post.status === "approved" ? "Save changes" : "Approve"}
            </button>
            {post.status === "draft" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => save("skipped")}
                className="rounded-lg border border-black/8 bg-surface-2 px-4 py-2 text-sm font-semibold text-ink-2 disabled:opacity-60"
              >
                Don&apos;t post this one
              </button>
            )}
            {msg && <span className="text-xs font-semibold text-muted">{msg}</span>}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-ink">{post.title}</p>
          {post.page_url && (
            <a href={post.page_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand hover:underline">
              See it on your website
            </a>
          )}
          {post.status === "published" && post.google_post_name && (
            <p className="mt-2 text-xs font-semibold text-good">Posted on your Google profile too.</p>
          )}
          {post.status === "published" && post.google_post && !post.google_post_name && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-semibold text-ink">Post it on Google too (30 seconds):</p>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{post.google_post}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={post.google_post} label="Copy the post" />
                <a
                  href="https://business.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-black/8 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2"
                >
                  Open Google Business Profile
                </a>
              </div>
              <p className="mt-2 text-xs text-muted">There, choose &ldquo;Add update&rdquo;, paste it and add one of the photos.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

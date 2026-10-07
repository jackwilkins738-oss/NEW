-- Walkthrough videos made by the panel (scripts/auto_video.py): a short phone-sized recording of the
-- firm's current site next to their preview, captioned with their own numbers. Public bucket - the
-- preview page plays it - written only through one-time signed upload URLs handed out behind the
-- service secret (POST /api/prospects/<slug>/video-upload). MP4 only, 25 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('preview-videos', 'preview-videos', true, 26214400, array['video/mp4'])
on conflict (id) do nothing;

-- A prospect's video_url may now also be one of those files (062 allowed the three players only).
alter table prospects drop constraint if exists prospects_video_url_check;
alter table prospects add constraint prospects_video_url_check check (
  video_url is null
  or video_url ~ '^https://(www\.loom\.com/embed/[a-f0-9]{32}|www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}|player\.vimeo\.com/video/[0-9]{6,12})$'
  or video_url ~ '^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/preview-videos/[a-z0-9-]{1,100}\.mp4$'
);

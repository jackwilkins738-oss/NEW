-- A personal video on a prospect's preview page: a 60-90 second screen recording (Loom, YouTube or
-- Vimeo) of the owner walking through their preview. Set from the panel (scripts/set_video.py) with
-- PATCH /api/prospects/<slug>; stored as the player's embed address (lib/prospects.ts,
-- videoEmbedUrl), so the website only ever frames one of three known players.
alter table prospects add column if not exists video_url text;
alter table prospects drop constraint if exists prospects_video_url_check;
alter table prospects add constraint prospects_video_url_check check (
  video_url is null or video_url ~ '^https://(www\.loom\.com/embed/[a-f0-9]{32}|www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}|player\.vimeo\.com/video/[0-9]{6,12})$'
);

-- Photos on website enquiries (app/api/leads/uploads, app/track.js): the
-- customer attaches pictures of the job to the enquiry form, so the
-- business can often price it without a survey visit. Private bucket; the
-- upload goes straight to storage through a one-time signed URL, and the
-- business sees the photos through signed links only.
alter table leads add column if not exists photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-photos', 'lead-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

drop policy if exists "member can read own lead photos" on storage.objects;
create policy "member can read own lead photos" on storage.objects
  for select using (
    bucket_id = 'lead-photos'
    and exists (select 1 from memberships m where m.user_id = auth.uid() and (storage.foldername(name))[1] = m.tenant_id::text)
  );

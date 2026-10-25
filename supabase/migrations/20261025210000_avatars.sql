-- Profile photos (D-50). A private bucket: one small square JPEG per user,
-- at {user_id}/avatar.jpg, shown through a signed URL. The browser crops
-- and shrinks it to 256 × 256 px before upload, so 1 MB is a generous limit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True for "{the signed-in user's id}/avatar.jpg", and nothing else.
create function public.avatar_path_is_own(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(array_length(storage.foldername(p_name), 1), 0) = 1
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and storage.filename(p_name) = 'avatar.jpg'
$$;

grant execute on function public.avatar_path_is_own(text) to authenticated;
revoke execute on function public.avatar_path_is_own(text) from public, anon;

-- storage.objects already has RLS on (Supabase). These cover the avatars
-- bucket only.
create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_own(name));

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatar_path_is_own(name));

-- Replacing the photo (upload with upsert).
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_own(name))
  with check (bucket_id = 'avatars' and public.avatar_path_is_own(name));

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_own(name));

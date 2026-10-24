-- Receipt photos (DESIGN §6.9, D-10, D-43). A private bucket: a photo is
-- never public, and is shown through a signed URL that expires after a few
-- minutes. One photo per transaction, at {user_id}/{transaction_id}.jpg,
-- shrunk in the browser to about 1600 px JPEG before upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True for "{the signed-in user's id}/{a uuid}.jpg", and nothing else.
create function public.receipt_path_is_own(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(array_length(storage.foldername(p_name), 1), 0) = 1
     and (storage.foldername(p_name))[1] = (select auth.uid())::text
     and storage.filename(p_name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
$$;

-- True when the file name is one of the user's own transactions. Runs with
-- the caller's rights: RLS on transactions hides everyone else's.
create function public.receipt_transaction_is_own(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.transactions t
    where t.id::text = split_part(storage.filename(p_name), '.', 1)
      and t.user_id = (select auth.uid())
  )
$$;

grant execute on function public.receipt_path_is_own(text) to authenticated;
grant execute on function public.receipt_transaction_is_own(text) to authenticated;
revoke execute on function public.receipt_path_is_own(text) from public, anon;
revoke execute on function public.receipt_transaction_is_own(text) from public, anon;

-- storage.objects already has RLS on (Supabase). These policies cover the
-- receipts bucket only; every other bucket stays closed.
create policy receipts_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.receipt_path_is_own(name));

create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.receipt_path_is_own(name) and public.receipt_transaction_is_own(name));

-- Replacing a photo (upload with upsert).
create policy receipts_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.receipt_path_is_own(name))
  with check (bucket_id = 'receipts' and public.receipt_path_is_own(name) and public.receipt_transaction_is_own(name));

-- Deleting is allowed even when the transaction is gone: that is how the
-- photo of a deleted transaction is removed (D-43).
create policy receipts_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.receipt_path_is_own(name));

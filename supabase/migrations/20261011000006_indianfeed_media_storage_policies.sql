drop policy if exists "IndianFeed media is public" on storage.objects;
create policy "IndianFeed media is public" on storage.objects
  for select to public
  using (bucket_id = 'indianfeed-media');

drop policy if exists "Users upload to own IndianFeed folder" on storage.objects;
create policy "Users upload to own IndianFeed folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'indianfeed-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own IndianFeed media" on storage.objects;
create policy "Users delete own IndianFeed media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'indianfeed-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

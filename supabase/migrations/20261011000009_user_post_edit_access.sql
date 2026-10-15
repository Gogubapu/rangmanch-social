grant select, insert, update, delete on public.posts to authenticated;

drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts" on public.posts
  for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "users manage own posts" on public.posts;
create policy "users manage own posts" on public.posts
  for delete to authenticated
  using (auth.uid() = author_id);

grant select, insert, delete on public.posts to authenticated;
grant select on public.profiles to authenticated, anon;

drop policy if exists "posts are public" on public.posts;
create policy "posts are public" on public.posts
  for select to anon, authenticated
  using (true);

drop policy if exists "users create posts" on public.posts;
create policy "users create posts" on public.posts
  for insert to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "users manage own posts" on public.posts;
create policy "users manage own posts" on public.posts
  for delete to authenticated
  using (auth.uid() = author_id);

drop policy if exists "profiles are searchable" on public.profiles;
create policy "profiles are searchable" on public.profiles
  for select to anon, authenticated
  using (true);

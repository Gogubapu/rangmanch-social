grant update on public.comments to authenticated;

drop policy if exists "users update own comments" on public.comments;
create policy "comment authors update their comments" on public.comments
  for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "users delete own comments" on public.comments;
create policy "comment authors or post owners delete comments" on public.comments
  for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.posts post
      where post.id = post_id and post.author_id = auth.uid()
    )
  );

drop policy if exists "users read their follows" on public.user_follows;

create policy "users read related follows" on public.user_follows
  for select to authenticated
  using (auth.uid() = follower_id or auth.uid() = following_id);

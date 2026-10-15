create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_no_self_follow check (follower_id <> following_id)
);

alter table public.user_follows enable row level security;
grant select, insert, delete on public.user_follows to authenticated;

create policy "users read their follows" on public.user_follows
  for select to authenticated using (auth.uid() = follower_id);
create policy "users follow as themselves" on public.user_follows
  for insert to authenticated with check (auth.uid() = follower_id);
create policy "users unfollow as themselves" on public.user_follows
  for delete to authenticated using (auth.uid() = follower_id);

create index if not exists user_follows_following_id_idx
  on public.user_follows (following_id);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2200),
  created_at timestamptz not null default now()
);

alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
grant select, insert, update, delete on public.post_likes to authenticated;
grant select on public.post_likes to anon;
grant select, insert, delete on public.comments to authenticated;
grant select on public.comments to anon;

drop policy if exists "likes are public" on public.post_likes;
create policy "likes are public" on public.post_likes
  for select to anon, authenticated using (true);
drop policy if exists "users like as themselves" on public.post_likes;
create policy "users like as themselves" on public.post_likes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users update own likes" on public.post_likes;
create policy "users update own likes" on public.post_likes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users remove own likes" on public.post_likes;
create policy "users remove own likes" on public.post_likes
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments
  for select to anon, authenticated using (true);
drop policy if exists "users comment as themselves" on public.comments;
create policy "users comment as themselves" on public.comments
  for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists "users delete own comments" on public.comments;
create policy "users delete own comments" on public.comments
  for delete to authenticated using (auth.uid() = author_id);

create index if not exists post_likes_post_id_idx on public.post_likes (post_id);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at desc);

notify pgrst, 'reload schema';

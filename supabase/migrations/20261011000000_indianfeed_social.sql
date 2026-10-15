create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text not null default '',
  avatar_url text,
  bio text default '',
  created_at timestamptz not null default now()
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null, caption text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null, caption text default '', expires_at timestamptz not null default now()+interval '24 hours', created_at timestamptz not null default now()
);
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 2200), created_at timestamptz not null default now()
);
alter table public.profiles enable row level security; alter table public.posts enable row level security; alter table public.stories enable row level security;
alter table public.post_likes enable row level security; alter table public.comments enable row level security;
grant select on public.profiles, public.posts, public.stories, public.post_likes, public.comments to anon, authenticated;
grant insert,update,delete on public.profiles, public.posts, public.stories, public.post_likes, public.comments to authenticated;
create policy "profiles are searchable" on public.profiles for select using (true);
create policy "users manage own profile" on public.profiles for all to authenticated using (auth.uid()=id) with check (auth.uid()=id);
create policy "posts are public" on public.posts for select using (true);
create policy "users create posts" on public.posts for insert to authenticated with check (auth.uid()=author_id);
create policy "users manage own posts" on public.posts for delete to authenticated using (auth.uid()=author_id);
create policy "active stories are public" on public.stories for select using (expires_at>now());
create policy "users create stories" on public.stories for insert to authenticated with check (auth.uid()=author_id);
create policy "users manage own stories" on public.stories for delete to authenticated using (auth.uid()=author_id);
create policy "likes are public" on public.post_likes for select using (true);
create policy "users like as themselves" on public.post_likes for insert to authenticated with check (auth.uid()=user_id);
create policy "users remove own likes" on public.post_likes for delete to authenticated using (auth.uid()=user_id);
create policy "comments are public" on public.comments for select using (true);
create policy "users comment as themselves" on public.comments for insert to authenticated with check (auth.uid()=author_id);
create policy "users delete own comments" on public.comments for delete to authenticated using (auth.uid()=author_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists profiles_username_idx on public.profiles using gin(to_tsvector('simple',username||' '||display_name));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('indianfeed-media','indianfeed-media',true,15728640,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime']) on conflict(id) do nothing;
create policy "IndianFeed media is public" on storage.objects for select using(bucket_id='indianfeed-media');
create policy "Users upload to own IndianFeed folder" on storage.objects for insert to authenticated with check(bucket_id='indianfeed-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users delete own IndianFeed media" on storage.objects for delete to authenticated using(bucket_id='indianfeed-media' and (storage.foldername(name))[1]=auth.uid()::text);

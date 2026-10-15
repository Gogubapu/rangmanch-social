-- Public Insights library with a Supabase Auth protected editorial workspace.
create table if not exists public.insight_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 5 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 180),
  category text not null check (char_length(category) between 1 and 60),
  excerpt text not null check (char_length(excerpt) between 20 and 320),
  content text not null check (char_length(content) between 30 and 30000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published' and published_at is not null) or (status = 'draft' and published_at is null))
);

alter table public.insight_posts enable row level security;
revoke all on table public.insight_posts from anon, authenticated;
grant select on table public.insight_posts to anon, authenticated;
grant insert, update, delete on table public.insight_posts to authenticated;

drop policy if exists "public may read published insights" on public.insight_posts;
create policy "public may read published insights"
  on public.insight_posts for select to anon
  using (status = 'published');

drop policy if exists "admins may read insights" on public.insight_posts;
create policy "admins may read insights"
  on public.insight_posts for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

drop policy if exists "admins may create insights" on public.insight_posts;
create policy "admins may create insights"
  on public.insight_posts for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

drop policy if exists "admins may update insights" on public.insight_posts;
create policy "admins may update insights"
  on public.insight_posts for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

drop policy if exists "admins may delete insights" on public.insight_posts;
create policy "admins may delete insights"
  on public.insight_posts for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

create index if not exists insight_posts_published_idx on public.insight_posts (published_at desc) where status = 'published';
create index if not exists insight_posts_updated_idx on public.insight_posts (updated_at desc);

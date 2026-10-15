alter table public.profiles
  add column if not exists is_private boolean not null default false;

create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_requests_no_self_request check (requester_id <> target_id)
);

alter table public.follow_requests enable row level security;
grant select, insert, delete on public.follow_requests to authenticated;
grant update (status, updated_at) on public.follow_requests to authenticated;
create policy "participants read follow requests" on public.follow_requests
  for select to authenticated using (auth.uid() = requester_id or auth.uid() = target_id);
create policy "users request private follows as themselves" on public.follow_requests
  for insert to authenticated with check (
    auth.uid() = requester_id
    and exists (select 1 from public.profiles profile where profile.id = target_id and profile.is_private)
  );
create policy "targets answer follow requests" on public.follow_requests
  for update to authenticated using (auth.uid() = target_id and status = 'pending')
  with check (auth.uid() = target_id and status = 'accepted');
create policy "requesters cancel pending follows" on public.follow_requests
  for delete to authenticated using (auth.uid() = requester_id and status = 'pending');
create policy "targets decline pending follows" on public.follow_requests
  for delete to authenticated using (auth.uid() = target_id and status = 'pending');
create index if not exists follow_requests_target_status_idx
  on public.follow_requests (target_id, status, created_at desc);
create unique index if not exists follow_requests_one_pending_idx
  on public.follow_requests (requester_id, target_id) where status = 'pending';

drop policy if exists "users follow as themselves" on public.user_follows;
create policy "users directly follow public profiles" on public.user_follows
  for insert to authenticated
  with check (
    auth.uid() = follower_id
    and exists (select 1 from public.profiles profile where profile.id = following_id and not profile.is_private)
  );

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('post_like', 'comment', 'new_follower', 'follow_request', 'follow_request_accepted')),
  post_id uuid references public.posts(id) on delete cascade,
  follow_request_id uuid references public.follow_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_no_self_event check (recipient_id <> actor_id)
);

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "users read their notifications" on public.notifications
  for select to authenticated using (auth.uid() = recipient_id);
create policy "users mark their notifications read" on public.notifications
  for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is not null and post_author <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, event_type, post_id)
    values (post_author, new.user_id, 'post_like', new.post_id);
  end if;
  return new;
end;
$$;
create trigger post_like_notification after insert on public.post_likes
  for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is not null and post_author <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, event_type, post_id)
    values (post_author, new.author_id, 'comment', new.post_id);
  end if;
  return new;
end;
$$;
create trigger post_comment_notification after insert on public.comments
  for each row execute function public.notify_post_comment();

create or replace function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.follower_id <> new.following_id then
    insert into public.notifications (recipient_id, actor_id, event_type)
    values (new.following_id, new.follower_id, 'new_follower');
  end if;
  return new;
end;
$$;
create trigger new_follower_notification after insert on public.user_follows
  for each row execute function public.notify_new_follower();

create or replace function public.notify_follow_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, actor_id, event_type, follow_request_id)
  values (new.target_id, new.requester_id, 'follow_request', new.id);
  return new;
end;
$$;
create trigger follow_request_notification after insert on public.follow_requests
  for each row execute function public.notify_follow_request();

create or replace function public.notify_accepted_follow_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.user_follows (follower_id, following_id)
    values (new.requester_id, new.target_id)
    on conflict (follower_id, following_id) do nothing;
    insert into public.notifications (recipient_id, actor_id, event_type, follow_request_id)
    values (new.requester_id, new.target_id, 'follow_request_accepted', new.id);
  end if;
  return new;
end;
$$;
create trigger accepted_follow_request_actions after update of status on public.follow_requests
  for each row execute function public.notify_accepted_follow_request();

revoke all on function public.notify_post_like() from public, anon, authenticated;
revoke all on function public.notify_post_comment() from public, anon, authenticated;
revoke all on function public.notify_new_follower() from public, anon, authenticated;
revoke all on function public.notify_follow_request() from public, anon, authenticated;
revoke all on function public.notify_accepted_follow_request() from public, anon, authenticated;

create or replace function public.get_profile_counts(profile_ids uuid[])
returns table (profile_id uuid, posts_count bigint, followers_count bigint, following_count bigint)
language sql stable security definer set search_path = public as $$
  select profile.id,
    (select count(*) from public.posts where author_id = profile.id),
    (select count(*) from public.user_follows where following_id = profile.id),
    (select count(*) from public.user_follows where follower_id = profile.id)
  from public.profiles as profile
  where profile.id = any(profile_ids) and auth.uid() is not null;
$$;
revoke all on function public.get_profile_counts(uuid[]) from public, anon;
grant execute on function public.get_profile_counts(uuid[]) to authenticated;

create or replace function public.can_view_profile_content(profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = profile_id
      and (not profile.is_private or profile.id = auth.uid()
        or exists (select 1 from public.user_follows follow where follow.follower_id = auth.uid() and follow.following_id = profile.id))
  );
$$;
revoke all on function public.can_view_profile_content(uuid) from public, anon;
grant execute on function public.can_view_profile_content(uuid) to authenticated, anon;

drop policy if exists "posts are public" on public.posts;
create policy "posts visible by profile access" on public.posts
  for select to anon, authenticated
  using (public.can_view_profile_content(author_id));
drop policy if exists "active stories are public" on public.stories;
create policy "active stories visible by profile access" on public.stories
  for select to anon, authenticated
  using (expires_at > now() and public.can_view_profile_content(author_id));
drop policy if exists "likes are public" on public.post_likes;
create policy "likes visible with post access" on public.post_likes
  for select to anon, authenticated
  using (exists (select 1 from public.posts post where post.id = post_id));
drop policy if exists "comments are public" on public.comments;
create policy "comments visible with post access" on public.comments
  for select to anon, authenticated
  using (exists (select 1 from public.posts post where post.id = post_id));

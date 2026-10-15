create or replace function public.get_profile_counts(profile_ids uuid[])
returns table (
  profile_id uuid,
  posts_count bigint,
  followers_count bigint,
  following_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    (select count(*) from public.posts where author_id = profile.id),
    (select count(*) from public.user_follows where following_id = profile.id),
    (select count(*) from public.user_follows where follower_id = profile.id)
  from public.profiles as profile
  where profile.id = any(profile_ids)
    and auth.uid() is not null;
$$;

revoke all on function public.get_profile_counts(uuid[]) from public, anon;
grant execute on function public.get_profile_counts(uuid[]) to authenticated;

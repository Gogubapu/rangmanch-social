with ranked_follower_notifications as (
  select id,
    row_number() over (
      partition by recipient_id, actor_id
      order by created_at desc, id desc
    ) as position
  from public.notifications
  where event_type = 'new_follower'
)
delete from public.notifications notification
using ranked_follower_notifications ranked
where notification.id = ranked.id
  and ranked.position > 1;

create unique index if not exists notifications_one_follower_event_idx
  on public.notifications (recipient_id, actor_id)
  where event_type = 'new_follower';

create or replace function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.follower_id <> new.following_id then
    insert into public.notifications (recipient_id, actor_id, event_type)
    values (new.following_id, new.follower_id, 'new_follower')
    on conflict (recipient_id, actor_id) where event_type = 'new_follower'
    do update set created_at = excluded.created_at, read_at = null;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_new_follower() from public, anon, authenticated;

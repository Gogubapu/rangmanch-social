alter table public.follow_requests
  drop constraint if exists follow_requests_requester_id_target_id_key;

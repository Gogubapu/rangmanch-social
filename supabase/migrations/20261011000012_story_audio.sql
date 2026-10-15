alter table public.stories
  add column if not exists audio_url text;

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']::text[]
  ) as mime_type
)
where id = 'indianfeed-media';

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_no_self_message check (sender_id <> recipient_id)
);

alter table public.direct_messages enable row level security;
grant select, insert on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;

create policy "participants read direct messages" on public.direct_messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "users send direct messages as themselves" on public.direct_messages
  for insert to authenticated
  with check (auth.uid() = sender_id);
create policy "recipients mark direct messages read" on public.direct_messages
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create index if not exists direct_messages_sender_created_idx
  on public.direct_messages (sender_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx
  on public.direct_messages (recipient_id, created_at desc);

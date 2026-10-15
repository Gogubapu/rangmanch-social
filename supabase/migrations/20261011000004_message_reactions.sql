create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '👏', '🔥')),
  created_at timestamptz not null default now(),
  constraint message_reactions_one_per_user unique (message_id, user_id)
);

alter table public.message_reactions enable row level security;
grant select, insert, update, delete on public.message_reactions to authenticated;

create policy "participants read message reactions" on public.message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.direct_messages m
    where m.id = message_id and (auth.uid() = m.sender_id or auth.uid() = m.recipient_id)
  ));
create policy "participants add own message reactions" on public.message_reactions
  for insert to authenticated
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.direct_messages m
      where m.id = message_id and (auth.uid() = m.sender_id or auth.uid() = m.recipient_id)
    )
  );
create policy "users update own message reactions" on public.message_reactions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.direct_messages m
    where m.id = message_id and (auth.uid() = m.sender_id or auth.uid() = m.recipient_id)
  ));
create policy "users remove own message reactions" on public.message_reactions
  for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists message_reactions_message_idx on public.message_reactions (message_id);

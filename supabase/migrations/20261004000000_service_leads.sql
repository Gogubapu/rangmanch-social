-- Public website enquiries. Anonymous visitors may submit; only platform admins
-- may read the submissions.
create table if not exists public.service_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  company text check (company is null or char_length(company) <= 160),
  service text not null check (char_length(service) between 1 and 100),
  message text not null check (char_length(message) between 10 and 2500),
  privacy_accepted boolean not null check (privacy_accepted),
  created_at timestamptz not null default now()
);

alter table public.service_leads enable row level security;
revoke all on table public.service_leads from anon, authenticated;
grant insert on table public.service_leads to anon;
grant select on table public.service_leads to authenticated;

drop policy if exists "public may submit service enquiries" on public.service_leads;
create policy "public may submit service enquiries"
  on public.service_leads for insert to anon
  with check (privacy_accepted is true);

drop policy if exists "platform admins may review service enquiries" on public.service_leads;
create policy "platform admins may review service enquiries"
  on public.service_leads for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

create index if not exists service_leads_created_at_idx on public.service_leads (created_at desc);

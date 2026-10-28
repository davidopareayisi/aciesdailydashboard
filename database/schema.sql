create table if not exists public.acies_records (
  collection text not null,
  id text not null,
  data jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
-- Upgrade the earlier website table in place and preserve existing records.
alter table public.acies_records add column if not exists revision integer not null default 1;
alter table public.acies_records drop constraint if exists acies_records_collection_check;
alter table public.acies_records add constraint acies_records_collection_check check (collection in ('users','sessions','creativeProfiles','invitations','notices','messages','media','challenges','invites','audit','enquiries','profiles','work','packages','limits','lessons','learningProgress','learningSubmissions'));
alter table public.acies_records enable row level security;
revoke all on public.acies_records from public, anon, authenticated;
grant select, insert, update, delete on public.acies_records to service_role;
insert into storage.buckets (id, name, public, file_size_limit) values ('acies-private','acies-private',false,8388608) on conflict (id) do nothing;
-- All account, file and row access goes through the portal server; no public policies.

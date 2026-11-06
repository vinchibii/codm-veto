-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- Public room state. Anyone with the page can read it; only the Vercel server can write it.
create table if not exists public.rooms (
  code        text primary key,
  rev         integer not null default 1,
  data        jsonb   not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Secret keys for the host and the two captain seats (stored as SHA-256 hashes).
-- No policies: browsers can never read or write this table, only the server's service key can.
create table if not exists public.room_keys (
  code       text primary key references public.rooms(code) on delete cascade,
  host_hash  text not null,
  t1_hash    text,
  t2_hash    text
);

alter table public.rooms     enable row level security;
alter table public.room_keys enable row level security;

grant select on public.rooms to anon, authenticated;
revoke all on public.room_keys from anon, authenticated;

drop policy if exists "Rooms are readable" on public.rooms;
create policy "Rooms are readable" on public.rooms for select to anon, authenticated using (true);

-- Send live updates for rooms to the page.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;

-- Optional clean-up: delete rooms older than 3 days. Run by hand, or schedule it with pg_cron.
-- delete from public.rooms where created_at < now() - interval '3 days';

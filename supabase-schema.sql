-- ============================================================
-- Bilhuset Sommer · Flådestyring — database schema
-- Run this in Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists cars (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  make        text not null,
  model       text not null,
  year        int,
  plate       text,
  vin         text,
  km          int default 0,
  price       int,
  status      text not null default 'service',
  location    text,
  notes       text,
  log         jsonb default '[]'::jsonb
);

-- Enable realtime so all devices update live
alter publication supabase_realtime add table cars;

-- Row Level Security.
-- The policy below allows anyone with the public anon key to read/write.
-- This is the simplest setup for a single internal tool with a private URL.
-- If you later want staff logins, replace this with auth-based policies.
alter table cars enable row level security;

create policy "Allow all access with anon key"
  on cars for all
  using (true)
  with check (true);

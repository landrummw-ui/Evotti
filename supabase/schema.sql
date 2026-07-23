-- =============================================================================
-- Evotti CRM — schema
-- =============================================================================
-- Three objects: companies, persons, activities.
--
-- Run this once in the Supabase SQL Editor. It is safe to re-run: it drops
-- and recreates the tables, which also wipes their contents. Do not run it
-- against anything you care about.
-- =============================================================================

-- gen_random_uuid() lives here. Present by default on Supabase, but harmless
-- to assert.
create extension if not exists pgcrypto;

drop table if exists public.activities cascade;
drop table if exists public.persons cascade;
drop table if exists public.companies cascade;


-- -----------------------------------------------------------------------------
-- companies
-- -----------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text,
  city        text,
  state       text,
  notes       text,

  -- 'agent' marks records the post-meeting agent created, so the UI can badge
  -- them. This is what makes the automation visible rather than invisible.
  source      text not null default 'manual'
              check (source in ('manual', 'agent')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- persons
-- -----------------------------------------------------------------------------
create table public.persons (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,

  first_name  text not null,
  last_name   text not null,
  title       text,
  email       text,
  phone       text,
  notes       text,

  source      text not null default 'manual'
              check (source in ('manual', 'agent')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- activities
-- -----------------------------------------------------------------------------
-- person_id is nullable so an activity can be logged against a company with no
-- specific contact. company_id is stored directly rather than derived through
-- the person, so company-level activity works and timeline queries stay simple.
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid references public.persons(id)   on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,

  type        text not null default 'note'
              check (type in ('meeting', 'call', 'email', 'note')),
  subject     text not null,
  body        text,
  occurred_at timestamptz not null default now(),

  source      text not null default 'manual'
              check (source in ('manual', 'agent')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- Indexes — foreign keys and the columns the timeline sorts on
-- -----------------------------------------------------------------------------
create index persons_company_id_idx     on public.persons     (company_id);
create index activities_person_id_idx   on public.activities  (person_id);
create index activities_company_id_idx  on public.activities  (company_id);
create index activities_occurred_at_idx on public.activities  (occurred_at desc);


-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function public.touch_updated_at();

create trigger persons_touch_updated_at
  before update on public.persons
  for each row execute function public.touch_updated_at();

create trigger activities_touch_updated_at
  before update on public.activities
  for each row execute function public.touch_updated_at();


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- !!  DEMO ONLY  -------------------------------------------------------------
-- !!
-- !!  These policies grant full read/write to the anonymous role, because the
-- !!  Monday demo has no authentication. The publishable key is embedded in
-- !!  client-side JavaScript and the Netlify URL is publicly reachable, so
-- !!  ANYONE WHO FINDS THE SITE CAN READ AND MODIFY EVERY ROW.
-- !!
-- !!  That is an acceptable trade for seeded, fictional demo data. It is NOT
-- !!  acceptable once real customer names, emails, or phone numbers land in
-- !!  these tables. Before that happens: add Supabase Auth and replace every
-- !!  policy below with one scoped to auth.uid().
-- !!
-- =============================================================================

alter table public.companies  enable row level security;
alter table public.persons    enable row level security;
alter table public.activities enable row level security;

create policy demo_open_companies on public.companies
  for all to anon, authenticated using (true) with check (true);

create policy demo_open_persons on public.persons
  for all to anon, authenticated using (true) with check (true);

create policy demo_open_activities on public.activities
  for all to anon, authenticated using (true) with check (true);

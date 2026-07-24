-- =============================================================================
-- Evotti App Platform — access control (UAC)
-- =============================================================================
-- Users authenticate (Supabase Auth). Each user has a profile whose PERSONA is
-- a related field; the persona decides which tiles the user sees. Dealer users
-- are tied to a dealer company.
--
--   auth.users ──1:1── profiles ──▶ personas        (the user's role)
--                          └────────▶ dealers         (dealer users only)
--   personas ──< persona_tiles >── tiles             (who sees what)
--
-- Run once in the Supabase SQL Editor, then load platform_seed.sql. Requires
-- Supabase Auth to be enabled (email/password). Safe to re-run.
-- =============================================================================

create extension if not exists pgcrypto;

drop table if exists public.persona_tiles cascade;
drop table if exists public.tiles cascade;
drop table if exists public.profiles cascade;
drop table if exists public.dealers cascade;
drop table if exists public.personas cascade;

-- -----------------------------------------------------------------------------
-- personas — the roles a user can hold
-- -----------------------------------------------------------------------------
create table public.personas (
  id          smallint primary key,
  key         text unique not null,           -- leadership | sales | controller | dealer
  name        text not null,
  description text,
  is_dealer   boolean not null default false, -- dealer personas land on the dealer home
  sort        int not null default 0
);

-- -----------------------------------------------------------------------------
-- dealers — dealer companies (one per sales region for the demo)
-- -----------------------------------------------------------------------------
create table public.dealers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  state       text,
  region      text,                            -- matches the Sales Analysis regions
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- profiles — one per auth user; PERSONA is the related field
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  persona_id  smallint references public.personas(id),
  dealer_id   uuid references public.dealers(id),   -- set for dealer users
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- tiles — the app catalog; the whole platform is "driven by these tiles"
-- -----------------------------------------------------------------------------
create table public.tiles (
  id          smallint primary key,
  key         text unique not null,
  title       text not null,
  description text,
  href        text,
  status      text not null default 'live'    -- live | planned
              check (status in ('live', 'planned')),
  sort        int not null default 0
);

-- -----------------------------------------------------------------------------
-- persona_tiles — which personas can see which tiles
-- -----------------------------------------------------------------------------
create table public.persona_tiles (
  persona_id  smallint references public.personas(id) on delete cascade,
  tile_id     smallint references public.tiles(id) on delete cascade,
  primary key (persona_id, tile_id)
);


-- =============================================================================
-- Profile bootstrap — every new auth user gets a profile row automatically.
-- The admin flow then sets the persona and (for dealers) the dealer.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Persona of the current request's user, without tripping RLS recursion.
create or replace function public.my_persona()
returns text language sql security definer stable set search_path = public as $$
  select p.key
  from public.profiles pr
  join public.personas p on p.id = pr.persona_id
  where pr.id = auth.uid();
$$;


-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.personas      enable row level security;
alter table public.dealers       enable row level security;
alter table public.tiles         enable row level security;
alter table public.persona_tiles enable row level security;
alter table public.profiles      enable row level security;

-- Catalog tables are readable by any signed-in user.
create policy read_personas      on public.personas      for select to authenticated using (true);
create policy read_dealers       on public.dealers       for select to authenticated using (true);
create policy read_tiles         on public.tiles         for select to authenticated using (true);
create policy read_persona_tiles on public.persona_tiles for select to authenticated using (true);

-- A user reads their own profile; Leadership reads all (for the admin screen).
-- All writes go through the service-role admin function (which bypasses RLS),
-- so there are deliberately no client insert/update policies here.
create policy read_own_or_leadership on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.my_persona() = 'leadership');

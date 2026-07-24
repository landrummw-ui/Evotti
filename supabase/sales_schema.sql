-- =============================================================================
-- Evotti Sales Analysis — schema
-- =============================================================================
-- One table: sales_daily. Grain is one row per workday x region x product line,
-- carrying actual and forecast for both units and revenue so variance is
-- computable at any level of aggregation.
--
-- Run this once in the Supabase SQL Editor, then load supabase/sales_seed.sql.
-- Safe to re-run: it drops and recreates the table.
-- =============================================================================

drop table if exists public.sales_daily cascade;

create table public.sales_daily (
  id                bigint generated always as identity primary key,

  sale_date         date not null,
  region            text not null,
  product_line      text not null,

  -- Actuals are whole boats; the plan is a smooth daily target, so it carries
  -- fractional units (a monthly plan spread across workdays).
  units_actual      integer       not null default 0,
  units_forecast    numeric(6,2)  not null default 0,

  revenue_actual    numeric(12,2) not null default 0,
  revenue_forecast  numeric(12,2) not null default 0,

  -- One row per date/region/line — lets the seed upsert cleanly.
  unique (sale_date, region, product_line)
);

-- The dashboard and the agent both filter and group on these.
create index sales_daily_date_idx   on public.sales_daily (sale_date);
create index sales_daily_region_idx on public.sales_daily (region);
create index sales_daily_line_idx   on public.sales_daily (product_line);


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- !!  DEMO ONLY  -------------------------------------------------------------
-- !!
-- !!  Read-only to the anonymous role: the dashboard reads these rows with the
-- !!  publishable key, and the agent only ever queries them. No client writes,
-- !!  so anon gets SELECT and nothing else. Seeding happens in the SQL Editor
-- !!  (service role), which bypasses RLS.
-- !!
-- !!  This is fine for seeded, fictional numbers. Before any real financials
-- !!  land here, scope this to an authenticated finance role.
-- !!
-- =============================================================================

alter table public.sales_daily enable row level security;

create policy demo_read_sales_daily on public.sales_daily
  for select to anon, authenticated using (true);

-- =============================================================================
-- Evotti — AI App & Agent Development board (Supabase-backed)
-- =============================================================================
-- Shared, persistent Kanban so everyone sees the same board. Run this once in
-- the Supabase SQL Editor (same project as the CRM). The app reads/writes with
-- the publishable key already in platform/config.js.
--
-- Safe to re-run: it drops and recreates the table (which wipes its rows), then
-- reseeds the demo cards. Do NOT re-run once you have real cards you care about.
-- =============================================================================

create extension if not exists pgcrypto;

drop table if exists public.dev_cards cascade;

create table public.dev_cards (
  id               text primary key,
  type             text not null default 'app',      -- app | agent
  title            text not null,
  user_story       text default '',
  description      text default '',
  requester        text default '',
  owner            text default '',
  request_date     date,
  completion_date  date,
  stage            text not null default 'requests',
  stage_entered_at timestamptz not null default now(),
  on_hold          boolean not null default false,
  rejected         boolean not null default false,
  rejection_reason text default '',
  tags             jsonb not null default '[]',
  comments         jsonb not null default '[]',
  attachments      jsonb not null default '[]',
  history          jsonb not null default '[]',
  position         double precision not null default 0,   -- order within a column
  updated_at       timestamptz not null default now()
);

create index dev_cards_stage_idx on public.dev_cards (stage, position);


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- !!  DEMO ONLY  -------------------------------------------------------------
-- !!  Full read/write to the anonymous role so the board is shared without a
-- !!  login. ANYONE WHO FINDS THE SITE CAN READ AND EDIT THE BOARD. That's an
-- !!  acceptable trade for a shared demo board; lock it down (Auth + a policy
-- !!  scoped to a role) before anything sensitive goes on it.
-- =============================================================================
alter table public.dev_cards enable row level security;

create policy demo_open_dev_cards on public.dev_cards
  for all to anon, authenticated using (true) with check (true);


-- =============================================================================
-- Seed — the demo cards (stage-entered dates are relative to "now" so the
-- green / yellow / red colors land sensibly whenever you load this).
-- =============================================================================
insert into public.dev_cards
  (id, type, title, user_story, requester, owner, stage, on_hold, rejected, rejection_reason, position, request_date, stage_entered_at, history)
values
  ('seed-01','agent','Warranty Claim Triage Agent','As a service manager, I want incoming warranty claims auto-classified and routed to the right dealer so that resolution starts within a day.','Dana Reyes','', 'requests', false,false,'', 0, (now()-interval '3 days')::date, now()-interval '1 days', jsonb_build_array(jsonb_build_object('stage','requests','at', now()-interval '1 days'))),
  ('seed-02','app','Customer Sentiment Dashboard','As Leadership, I want sentiment across dealer and buyer feedback in one view so that we spot issues early.','Mark Landrum','', 'requests', false,false,'', 1, (now()-interval '8 days')::date, now()-interval '6 days', jsonb_build_array(jsonb_build_object('stage','requests','at', now()-interval '6 days'))),
  ('seed-03','app','Build Delay Predictor','As operations, I want a model that flags hulls likely to slip their ship date so that we can intervene.','Chen Okafor','Priya Nair', 'requirements', false,false,'', 0, (now()-interval '9 days')::date, now()-interval '6 days', jsonb_build_array(jsonb_build_object('stage','requirements','at', now()-interval '6 days'))),
  ('seed-04','agent','Dealer Quote Assistant','As a dealer, I want an assistant that drafts a configured quote from a few inputs so that turnaround is faster.','Dana Reyes','Sam Cole', 'ready_dev', false,false,'', 0, (now()-interval '4 days')::date, now()-interval '1 days', jsonb_build_array(jsonb_build_object('stage','ready_dev','at', now()-interval '1 days'))),
  ('seed-05','app','Lead Scoring Model','As Sales, I want Boat Builder leads scored by likelihood to close so that dealers work the best ones first.','Dana Reyes','Priya Nair', 'in_dev', false,false,'', 0, (now()-interval '20 days')::date, now()-interval '18 days', jsonb_build_array(jsonb_build_object('stage','in_dev','at', now()-interval '18 days'))),
  ('seed-06','agent','Sales Forecast Copilot','As the Controller, I want to ask forecast questions in plain English so that I can analyze without waiting on a report.','Chen Okafor','Sam Cole', 'in_dev', false,false,'', 1, (now()-interval '5 days')::date, now()-interval '3 days', jsonb_build_array(jsonb_build_object('stage','in_dev','at', now()-interval '3 days'))),
  ('seed-07','app','Spec Sheet Generator','As marketing, I want spec sheets generated from the options catalog so that they''re always current.','Priya Nair','Sam Cole', 'qa', false,false,'', 0, (now()-interval '6 days')::date, now()-interval '4 days', jsonb_build_array(jsonb_build_object('stage','qa','at', now()-interval '4 days'))),
  ('seed-08','agent','Onboarding Chatbot','As a new dealer, I want a chatbot that answers setup questions so that onboarding is self-serve.','Mark Landrum','Priya Nair', 'uat', true,false,'', 0, (now()-interval '7 days')::date, now()-interval '5 days', jsonb_build_array(jsonb_build_object('stage','uat','at', now()-interval '5 days'))),
  ('seed-09','app','Options Pricing Optimizer','As finance, I want price recommendations per configuration so that margin stays consistent.','Chen Okafor','Sam Cole', 'ready_deploy', false,false,'', 0, (now()-interval '3 days')::date, now()-interval '1 days', jsonb_build_array(jsonb_build_object('stage','ready_deploy','at', now()-interval '1 days'))),
  ('seed-10','agent','Inventory Reorder Agent','As operations, I want long-lead parts reordered automatically at threshold so that builds aren''t blocked.','Chen Okafor','Priya Nair', 'golive', false,false,'', 0, (now()-interval '9 days')::date, now()-interval '7 days', jsonb_build_array(jsonb_build_object('stage','golive','at', now()-interval '7 days'))),
  ('seed-11','app','AR Auto-Dunning Bot','As finance, I want overdue invoices chased automatically.','Chen Okafor','', 'rejected', false,true,'Out of scope for this year — revisit after the CRM rollout.', 0, (now()-interval '20 days')::date, now()-interval '8 days', jsonb_build_array(jsonb_build_object('stage','requests','at', now()-interval '20 days'), jsonb_build_object('stage','rejected','at', now()-interval '8 days')));

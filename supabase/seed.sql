-- =============================================================================
-- Evotti CRM — seed data
-- =============================================================================
-- Run AFTER schema.sql. Re-runnable: clears all three tables first.
--
-- Demo setup:
--   * One company, Evotti.
--   * Two contacts already known to the CRM — Andrew Bona and Mike Blank.
--   * No activities. The CRM starts quiet on purpose, so the first thing that
--     ever appears on the timeline is what the agent writes after the meeting.
--   * Tom Cooper is deliberately ABSENT. The post-meeting agent creates him.
--     Do not add him here.
-- =============================================================================

truncate table public.activities, public.persons, public.companies cascade;

insert into public.companies (name, domain, city, state, notes)
values (
  'Evotti',
  'evotti.com',
  'Elkhart',
  'Indiana',
  'Premium pontoon manufacturer. Independent and family-run. '
  || 'Sells through a dealer network; customers configure online via the '
  || 'Boat Builder, which routes the design to a local dealer.'
);

insert into public.persons (company_id, first_name, last_name, title)
select id, 'Andrew', 'Bona', 'CFO' from public.companies where name = 'Evotti';

insert into public.persons (company_id, first_name, last_name, title)
select id, 'Mike', 'Blank', 'Controller' from public.companies where name = 'Evotti';

-- Sanity check — expect 1 company, 2 persons, 0 activities.
select
  (select count(*) from public.companies)  as companies,
  (select count(*) from public.persons)    as persons,
  (select count(*) from public.activities) as activities;

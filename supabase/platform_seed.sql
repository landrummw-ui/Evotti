-- =============================================================================
-- Evotti App Platform — seed
-- =============================================================================
-- Personas, dealer companies, the tile catalog, and the persona→tile matrix.
-- Run after platform_schema.sql. Users are created through the admin screen
-- (see the bootstrap note at the bottom for the first Leadership user).
-- =============================================================================

-- personas ---------------------------------------------------------------------
insert into public.personas (id, key, name, description, is_dealer, sort) values
  (1, 'leadership', 'Leadership',        'All-access executive view.',              false, 10),
  (2, 'sales',      'Sales',             'Leads, sales analysis, dealer activity.', false, 20),
  (3, 'controller', 'Controller / Finance', 'Financial performance and cost.',      false, 30),
  (4, 'dealer',     'Dealer',            'A dealer''s own queue, builds and claims.', true, 40)
on conflict (id) do update set
  key = excluded.key, name = excluded.name, description = excluded.description,
  is_dealer = excluded.is_dealer, sort = excluded.sort;

-- dealers (one per Sales Analysis region) --------------------------------------
insert into public.dealers (name, city, state, region) values
  ('Great Lakes Marine',   'Elkhart',      'IN', 'Great Lakes'),
  ('Harborline Boats',     'Charleston',   'SC', 'Southeast'),
  ('Gulf Coast Yachts',    'Tampa',        'FL', 'Gulf'),
  ('Bay State Marine',     'Newport',      'RI', 'Northeast'),
  ('Cascade Watersports',  'Seattle',      'WA', 'West');

-- tiles (the app catalog) ------------------------------------------------------
insert into public.tiles (id, key, title, description, href, status, sort) values
  (1, 'crm',          'Evotti CRM',         'Track Boat Builder leads from first configuration through dealer assignment, quote, and delivered build.', 'crm/',    'live',    10),
  (2, 'sales',        'Sales Analysis',     'Daily actuals against plan by region and product line, with an agent that answers questions in plain English.', 'sales/', 'live',    20),
  (3, 'dealer_portal','Dealer Portal',      'A dealer''s queue, quoting tools, and shared visibility into build status.', 'dealer/', 'planned', 30),
  (4, 'build',        'Build Tracker',      'Follow a hull from order through the floor to shipment, with dates dealers and buyers can rely on.', '#',       'planned', 40),
  (5, 'warranty',     'Warranty & Service', 'Log claims against a specific hull, route them to the dealer, and spot issues repeating across a series.', '#',       'planned', 50),
  (6, 'pricing',      'Options & Pricing',  'One source of truth for configurations and price, feeding the Boat Builder and every dealer quote.', '#',       'planned', 60)
on conflict (id) do update set
  key = excluded.key, title = excluded.title, description = excluded.description,
  href = excluded.href, status = excluded.status, sort = excluded.sort;

-- persona → tiles (who sees what) ----------------------------------------------
insert into public.persona_tiles (persona_id, tile_id) values
  -- Leadership: everything
  (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),
  -- Sales
  (2,1),(2,2),(2,3),(2,6),
  -- Controller / Finance
  (3,2),(3,4),(3,5),(3,6),
  -- Dealer (shown on the dealer home — they're already in the portal)
  (4,4),(4,5),(4,6)
on conflict do nothing;

-- =============================================================================
-- Bootstrap the first Leadership user (do this once, by hand):
--   1. Supabase dashboard → Authentication → Users → Add user
--      (email + password; tick "Auto confirm").
--   2. Then run, with that user's email:
--        update public.profiles
--        set persona_id = 1, full_name = 'Your Name'
--        where email = 'you@example.com';
--   3. Log in as that user → the Admin tile creates everyone else.
-- =============================================================================

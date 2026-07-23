// Supabase connection for the Evotti CRM demo.
//
// The publishable key is designed to be exposed in client-side code — it is
// not a secret. What protects the data is the row-level security policy set,
// and right now that policy set is deliberately wide open for the demo.
// See the warning block in supabase/schema.sql before real data goes in here.

window.EVOTTI_CONFIG = {
  supabaseUrl: 'https://otwsxsftqbtwdqfofswk.supabase.co',
  supabaseKey: 'sb_publishable_Nj1MY6k3yxohmlOBfpDwgw_XGKIacfO',
};

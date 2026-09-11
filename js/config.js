/* Backend configuration. The Supabase anon key is a public, browser-safe key:
   access is restricted by row-level security so each signed-in account only ever
   sees its own rows. With no session the app still works fully offline/local. */
window.LIFE_HUB_CONFIG = {
  SUPABASE_URL: 'https://opxmetycpvbhbcdcqjie.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_f3_UmEfVn1UMnNKqrIQc1Q_yljnOSP7',
  TABLE: 'records'
};

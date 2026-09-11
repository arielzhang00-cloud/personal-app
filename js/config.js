/* Backend configuration.
   Leave BACKEND null to run purely local-first (data persists in this browser via
   IndexedDB). Set it to a Supabase project to sync the same data across devices:

   window.LIFE_HUB_CONFIG = {
     BACKEND: 'supabase',
     SUPABASE_URL: 'https://xxxx.supabase.co',
     SUPABASE_ANON_KEY: 'public-anon-key',
     TABLE: 'records'
   };

   Expected table:
     create table records (
       id text primary key,
       collection text not null,
       data jsonb not null,
       deleted boolean not null default false,
       updated_at timestamptz not null default now()
     );
*/
window.LIFE_HUB_CONFIG = {
  BACKEND: null,
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  TABLE: 'records'
};

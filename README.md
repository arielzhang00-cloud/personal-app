# Life Hub

Offline-first personal tracker hosted on GitHub Pages. Eight sections — dailies,
nutrition, exercise, events, budgeting, gifts, focus, whimsy — laid out as 2 columns
on mobile and 4 columns on desktop.

## Behaviour

- **Installable PWA.** Add it to your home screen; it opens full screen.
- **Works with no connection.** A service worker caches every page you've opened, so
  the most recent version loads instantly offline.
- **Autosave everywhere.** Every input is written to IndexedDB as you type — nothing
  needs a save button.
- **Sync when the network returns.** Writes are queued and flushed to the backend as
  soon as connectivity is back (see below).

## Nutrition page

Day picker and weight input on top, live calorie / protein / fiber / weight totals
below, a saved-item picker plus a **Saved items** manager, an editable food table
(item, quantity g, quantity ct, calories, protein, fiber) and a weight chart with
last week / month / 3 months / year toggles.

Picking a saved item opens a popup that both edits the item's own nutrition facts and
lets you enter how much of it to add to the day; values are scaled from the serving size.

## Backend

Everything is written to IndexedDB first, then pushed to Supabase. Sign in with an
email and password (top-right) to sync a device; the session is stored on the device
and refreshed in the background, so each device is signed in once. Signed out, the
app still works and keeps every input locally. Conflicts resolve last-write-wins on
`updated_at`.

The project's connection details live in `js/config.js`. The anon key there is a
public, browser-safe key — privacy comes from row-level security:

```sql
create table records (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  collection text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table records enable row level security;
create policy "own rows" on records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Supabase → Authentication → Providers → Email must have email sign-in enabled. Turn
off "Confirm email" to sign in immediately after creating an account.

## Local development

```bash
python3 -m http.server 8000
```

then open http://localhost:8000.

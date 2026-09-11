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

Out of the box everything persists locally in IndexedDB. To sync across devices,
create a Supabase project with:

```sql
create table records (
  id text primary key,
  collection text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
```

then fill in `js/config.js`:

```js
window.LIFE_HUB_CONFIG = {
  BACKEND: 'supabase',
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'public-anon-key',
  TABLE: 'records'
};
```

Conflicts resolve last-write-wins on `updated_at`.

## Local development

```bash
python3 -m http.server 8000
```

then open http://localhost:8000.

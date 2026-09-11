/* Offline-first sync: drains the dirty queue to the backend whenever the network is
   available, then pulls anything newer from the backend. Last-write-wins on updatedAt. */
(function (global) {
  'use strict';

  var cfg = global.LIFE_HUB_CONFIG || {};
  var enabled = cfg.BACKEND === 'supabase' && !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY;
  var timer = null;
  var running = false;
  var statusListeners = [];

  function setStatus(state, text) {
    statusListeners.forEach(function (cb) { cb(state, text); });
    var el = document.getElementById('sync-status');
    if (el) { el.dataset.state = state; el.textContent = text; }
  }

  function headers() {
    return {
      'apikey': cfg.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
  }

  function push(rows) {
    if (!rows.length) return Promise.resolve();
    var body = rows.map(function (r) {
      return {
        id: r.id,
        collection: r.collection,
        data: r.data,
        deleted: !!r.deleted,
        updated_at: r.updatedAt
      };
    });
    return fetch(cfg.SUPABASE_URL + '/rest/v1/' + cfg.TABLE, {
      method: 'POST', headers: headers(), body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('push failed: ' + res.status);
      return global.DB.markClean(rows.map(function (r) { return r.id; }));
    });
  }

  function pull() {
    return global.DB.meta('lastPull').then(function (since) {
      var url = cfg.SUPABASE_URL + '/rest/v1/' + cfg.TABLE + '?select=*';
      if (since) url += '&updated_at=gt.' + encodeURIComponent(since);
      return fetch(url, { headers: headers() }).then(function (res) {
        if (!res.ok) throw new Error('pull failed: ' + res.status);
        return res.json();
      }).then(function (rows) {
        var newest = since;
        return rows.reduce(function (chain, r) {
          if (!newest || r.updated_at > newest) newest = r.updated_at;
          return chain.then(function () {
            return global.DB.put(r.collection, {
              id: r.id, data: r.data, deleted: r.deleted, updatedAt: r.updated_at
            }, { fromRemote: true });
          });
        }, Promise.resolve()).then(function () {
          if (newest) return global.DB.meta('lastPull', newest);
        });
      });
    });
  }

  var Sync = {
    enabled: enabled,

    onStatus: function (cb) { statusListeners.push(cb); },

    schedule: function () {
      if (timer) return;
      timer = setTimeout(function () { timer = null; Sync.run(); }, 800);
    },

    run: function () {
      if (!enabled) {
        setStatus(navigator.onLine ? 'synced' : 'offline',
          navigator.onLine ? 'saved on device' : 'offline · saved');
        return Promise.resolve();
      }
      if (running) return Promise.resolve();
      if (!navigator.onLine) {
        return global.DB.pending().then(function (rows) {
          setStatus('offline', rows.length ? 'offline · ' + rows.length + ' queued' : 'offline · saved');
        });
      }
      running = true;
      setStatus('syncing', 'syncing…');
      return global.DB.pending()
        .then(push)
        .then(pull)
        .then(function () { setStatus('synced', 'synced'); })
        .catch(function (err) {
          console.warn('[sync]', err);
          return global.DB.pending().then(function (rows) {
            setStatus('offline', rows.length ? rows.length + ' queued' : 'sync retry');
          });
        })
        .then(function () { running = false; });
    }
  };

  global.Sync = Sync;

  global.addEventListener('online', function () { Sync.run(); });
  global.addEventListener('offline', function () { Sync.run(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) Sync.run();
  });
  global.addEventListener('load', function () {
    Sync.run();
    setInterval(function () { Sync.run(); }, 60000);
  });
})(window);

/* Offline-first sync: drains the dirty queue to Supabase whenever the network and a
   signed-in session are available, then pulls anything newer. Last-write-wins on updatedAt.
   With no backend configured (or signed out) everything still persists locally. */
(function (global) {
  'use strict';

  var cfg = global.LIFE_HUB_CONFIG || {};
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var timer = null;
  var running = false;
  var statusListeners = [];

  function setStatus(state, text) {
    statusListeners.forEach(function (cb) { cb(state, text); });
    var el = document.getElementById('sync-status');
    if (el) { el.dataset.state = state; el.textContent = text; }
  }

  function headers(token) {
    return {
      'apikey': cfg.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
  }

  /* Record ids are only unique per user, so they are namespaced by user id before
     going to the backend, where id is the primary key. */
  function remoteId(userId, id) { return userId + ':' + id; }

  function localId(userId, id) {
    var prefix = userId + ':';
    return id.indexOf(prefix) === 0 ? id.slice(prefix.length) : id;
  }

  function push(token, userId, rows) {
    if (!rows.length) return Promise.resolve();
    var body = rows.map(function (r) {
      return {
        id: remoteId(userId, r.id),
        user_id: userId,
        collection: r.collection,
        data: r.data,
        deleted: !!r.deleted,
        updated_at: r.updatedAt
      };
    });
    return fetch(cfg.SUPABASE_URL + '/rest/v1/' + cfg.TABLE, {
      method: 'POST', headers: headers(token), body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('push ' + res.status + ': ' + t); });
      return global.DB.markClean(rows.map(function (r) { return r.id; }));
    });
  }

  function pull(token, userId) {
    return global.DB.meta('lastPull').then(function (since) {
      var url = cfg.SUPABASE_URL + '/rest/v1/' + cfg.TABLE + '?select=*&order=updated_at.asc';
      if (since) url += '&updated_at=gt.' + encodeURIComponent(since);
      return fetch(url, { headers: headers(token) }).then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error('pull ' + res.status + ': ' + t); });
        return res.json();
      }).then(function (rows) {
        var newest = since;
        return rows.reduce(function (chain, r) {
          if (!newest || r.updated_at > newest) newest = r.updated_at;
          return chain.then(function () {
            return global.DB.put(r.collection, {
              id: localId(userId, r.id), data: r.data, deleted: r.deleted, updatedAt: r.updated_at
            }, { fromRemote: true });
          });
        }, Promise.resolve()).then(function () {
          if (newest) return global.DB.meta('lastPull', newest);
        });
      });
    });
  }

  function queuedStatus(prefix) {
    return global.DB.pending().then(function (rows) {
      setStatus('offline', rows.length ? prefix + ' · ' + rows.length + ' queued' : prefix);
    });
  }

  var Sync = {
    configured: configured,

    onStatus: function (cb) { statusListeners.push(cb); },

    schedule: function () {
      if (timer) return;
      timer = setTimeout(function () { timer = null; Sync.run(); }, 800);
    },

    run: function () {
      if (running) return Promise.resolve();
      if (!configured) {
        setStatus('synced', 'saved on device');
        return Promise.resolve();
      }
      var user = global.Auth && global.Auth.user();
      if (!user) {
        setStatus('offline', 'saved on device · sign in to sync');
        return Promise.resolve();
      }
      if (!navigator.onLine) return queuedStatus('offline');

      running = true;
      setStatus('syncing', 'syncing…');
      return global.Auth.token().then(function (token) {
        if (!token) { setStatus('offline', 'sign in to sync'); return; }
        return global.DB.pending()
          .then(function (rows) { return push(token, user.id, rows); })
          .then(function () { return pull(token, user.id); })
          .then(function () { setStatus('synced', 'synced'); });
      }).catch(function (err) {
        console.warn('[sync]', err);
        return queuedStatus('sync retry');
      }).then(function () { running = false; });
    }
  };

  global.Sync = Sync;

  global.addEventListener('online', function () { Sync.run(); });
  global.addEventListener('offline', function () { Sync.run(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) Sync.run(); });
  global.addEventListener('load', function () {
    Sync.run();
    setInterval(function () { Sync.run(); }, 60000);
  });
})(window);

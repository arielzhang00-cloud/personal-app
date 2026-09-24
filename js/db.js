/* Local-first storage layer.
   Every write goes to IndexedDB immediately (works with no network at all) and is
   queued for the remote backend, which is drained whenever connectivity returns. */
(function (global) {
  'use strict';

  var DB_NAME = 'life-hub';
  var DB_VERSION = 1;
  var STORE = 'records';
  var META = 'meta';

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('collection', 'collection');
          store.createIndex('dirty', 'dirty');
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(storeName, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode);
        var store = t.objectStore(storeName);
        var out = fn(store);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  var listeners = {};
  function emit(collection) {
    (listeners[collection] || []).forEach(function (cb) {
      try { cb(); } catch (e) { console.error(e); }
    });
    (listeners['*'] || []).forEach(function (cb) { cb(collection); });
  }

  var DB = {
    uuid: uuid,

    onChange: function (collection, cb) {
      (listeners[collection] = listeners[collection] || []).push(cb);
      return function () {
        listeners[collection] = listeners[collection].filter(function (f) { return f !== cb; });
      };
    },

    /** Insert or update a record. `record.id` is generated when missing. */
    put: function (collection, record, opts) {
      opts = opts || {};
      var now = new Date().toISOString();
      var row = {
        id: record.id || uuid(),
        collection: collection,
        updatedAt: now,
        deleted: record.deleted === true,
        dirty: opts.fromRemote ? 0 : 1,
        data: Object.assign({}, record.data !== undefined ? record.data : record)
      };
      delete row.data.id;
      if (opts.fromRemote && record.updatedAt) row.updatedAt = record.updatedAt;
      var write = opts.fromRemote
        ? tx(STORE, 'readwrite', function (store) {
            var req = store.get(row.id);
            req.onsuccess = function () {
              var local = req.result;
              /* A local edit that has not reached the backend yet outranks the pull. */
              if (local && local.dirty === 1 && local.updatedAt > row.updatedAt) return;
              store.put(row);
            };
          })
        : tx(STORE, 'readwrite', function (store) { store.put(row); });
      return write
        .then(function () {
          emit(collection);
          if (!opts.fromRemote && global.Sync) global.Sync.schedule();
          return row.id;
        });
    },

    remove: function (collection, id) {
      return DB.get(collection, id).then(function (existing) {
        return DB.put(collection, { id: id, deleted: true, data: (existing && existing.data) || {} });
      });
    },

    get: function (collection, id) {
      return tx(STORE, 'readonly', function (store) { return store.get(id); })
        .then(function (row) {
          if (!row || row.deleted || row.collection !== collection) return null;
          return Object.assign({ id: row.id, updatedAt: row.updatedAt }, row.data);
        });
    },

    all: function (collection) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var out = [];
          var t = db.transaction(STORE, 'readonly');
          var req = t.objectStore(STORE).index('collection').openCursor(IDBKeyRange.only(collection));
          req.onsuccess = function () {
            var cur = req.result;
            if (!cur) { resolve(out); return; }
            if (!cur.value.deleted) {
              out.push(Object.assign({ id: cur.value.id, updatedAt: cur.value.updatedAt }, cur.value.data));
            }
            cur.continue();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    },

    /** Raw rows (including tombstones) still waiting to reach the backend. */
    pending: function () {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var out = [];
          var t = db.transaction(STORE, 'readonly');
          var req = t.objectStore(STORE).index('dirty').openCursor(IDBKeyRange.only(1));
          req.onsuccess = function () {
            var cur = req.result;
            if (!cur) { resolve(out); return; }
            out.push(cur.value);
            cur.continue();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    },

    /** Clears the dirty flag only on rows untouched since they were read for the push. */
    markClean: function (rows) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORE, 'readwrite');
          var store = t.objectStore(STORE);
          rows.forEach(function (pushed) {
            var req = store.get(pushed.id);
            req.onsuccess = function () {
              var row = req.result;
              if (row && row.updatedAt === pushed.updatedAt) { row.dirty = 0; store.put(row); }
            };
          });
          t.oncomplete = resolve;
          t.onerror = function () { reject(t.error); };
        });
      });
    },

    /** Drops every local record, e.g. when switching accounts on a shared device. */
    wipe: function () {
      return tx(STORE, 'readwrite', function (store) { return store.clear(); })
        .then(function () { return tx(META, 'readwrite', function (store) { return store.clear(); }); });
    },

    meta: function (key, value) {
      if (value === undefined) {
        return tx(META, 'readonly', function (store) { return store.get(key); })
          .then(function (row) { return row ? row.value : null; });
      }
      return tx(META, 'readwrite', function (store) { store.put({ key: key, value: value }); });
    }
  };

  global.DB = DB;
})(window);

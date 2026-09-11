/* Minimal Supabase auth over REST. Accounts are a user ID plus a 4-digit PIN; both
   are mapped onto an internal Supabase email/password pair, so no email is involved.
   The session is stored locally and refreshed in the background, so a device signs in
   once. Row-level security keys off the returned user id. */
(function (global) {
  'use strict';

  var cfg = global.LIFE_HUB_CONFIG || {};
  var KEY = 'life-hub-auth';
  var session = null;
  var listeners = [];

  function load() {
    try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (e) { session = null; }
  }

  function save(s) {
    session = s;
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    listeners.forEach(function (cb) { cb(Auth.user()); });
  }

  function fromTokenResponse(json) {
    if (!json || !json.access_token) return null;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      email: (json.user && json.user.email) || (session && session.email) || null,
      user_id: (json.user && json.user.id) || (session && session.user_id) || null
    };
  }

  function fetchUser() {
    if (!session) return Promise.resolve(null);
    return fetch(cfg.SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) {
        if (u) save(Object.assign({}, session, { email: u.email, user_id: u.id }));
        return u;
      }).catch(function () { return null; });
  }

  function refresh() {
    if (!session || !session.refresh_token) return Promise.resolve(null);
    return fetch(cfg.SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var s = fromTokenResponse(json);
        if (s) save(s);
        return s;
      }).catch(function () { return null; });
  }

  var USER_DOMAIN = 'lifehub.app';

  function handle(userId) {
    return String(userId).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  }

  function credentials(userId, pin) {
    var id = handle(userId);
    return { email: id + '@' + USER_DOMAIN, password: 'lifehub:' + id + ':' + String(pin) };
  }

  function post(path, body) {
    return fetch(cfg.SUPABASE_URL + path, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        if (!r.ok) throw new Error(json.msg || json.error_description || json.message || 'request failed');
        return json;
      });
    });
  }

  var Auth = {
    enabled: function () { return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY); },

    user: function () {
      return session ? { email: session.email, id: session.user_id } : null;
    },

    onChange: function (cb) { listeners.push(cb); cb(Auth.user()); },

    /** Valid access token, refreshed when close to expiry. Null when signed out. */
    token: function () {
      if (!session) return Promise.resolve(null);
      if (session.expires_at - 60 > Math.floor(Date.now() / 1000)) {
        return Promise.resolve(session.access_token);
      }
      return refresh().then(function (s) { return s ? s.access_token : null; });
    },

    /** Display name for the account, i.e. what the user typed as their user ID. */
    name: function () {
      if (!session || !session.email) return null;
      return session.email.split('@')[0];
    },

    signIn: function (userId, pin) {
      return post('/auth/v1/token?grant_type=password', credentials(userId, pin))
        .then(function (json) {
          var s = fromTokenResponse(json);
          if (!s) throw new Error('Could not sign in.');
          save(s);
          return Auth.user();
        })
        .catch(function (err) {
          throw new Error(/invalid login/i.test(err.message) ? 'Wrong user ID or PIN.' : err.message);
        });
    },

    signUp: function (userId, pin) {
      return post('/auth/v1/signup', credentials(userId, pin))
        .then(function (json) {
          var s = fromTokenResponse(json);
          if (s) { save(s); return Auth.user(); }
          return null;
        })
        .catch(function (err) {
          throw new Error(/already/i.test(err.message) ? 'That user ID is taken — sign in instead.' : err.message);
        });
    },

    signOut: function () { save(null); }
  };

  load();
  if (session) {
    fetchUser();
    // Keep the refresh token alive so a signed-in device never has to sign in again.
    setInterval(function () { Auth.token(); }, 10 * 60 * 1000);
    window.addEventListener('online', function () { Auth.token(); });
  }

  global.Auth = Auth;
})(window);

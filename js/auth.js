/* Minimal Supabase auth over REST: email magic link, token stored locally so the
   app stays signed in offline. Row-level security keys off the returned user id. */
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

  function parseHash() {
    if (!location.hash || location.hash.indexOf('access_token') === -1) return false;
    var params = new URLSearchParams(location.hash.slice(1));
    var s = {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_at: Math.floor(Date.now() / 1000) + parseInt(params.get('expires_in') || '3600', 10),
      email: null,
      user_id: null
    };
    save(s);
    history.replaceState(null, '', location.pathname + location.search);
    fetchUser();
    return true;
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

    signIn: function (email) {
      var redirect = location.origin + location.pathname;
      return fetch(cfg.SUPABASE_URL + '/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), {
        method: 'POST',
        headers: { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, create_user: true })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.msg || e.error_description || 'sign-in failed'); });
        return true;
      });
    },

    signOut: function () { save(null); }
  };

  load();
  parseHash();
  if (session) { fetchUser(); }

  global.Auth = Auth;
})(window);

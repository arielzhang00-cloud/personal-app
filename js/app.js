/* Shared app bootstrap: service worker registration + small helpers. */
(function (global) {
  'use strict';

  if ('serviceWorker' in navigator) {
    global.addEventListener('load', function () {
      var base = location.pathname.replace(/[^/]*$/, '');
      navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(function (err) {
        console.warn('[sw] registration failed', err);
      });
    });
  }

  function todayISO() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  function round(n, places) {
    var f = Math.pow(10, places === undefined ? 1 : places);
    return Math.round(n * f) / f;
  }

  /** Saves on input, debounced, so nothing is ever lost to a closed tab. */
  function autosave(fn, delay) {
    var t = null;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, delay === undefined ? 400 : delay);
    };
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* Account control in the top bar: email + password sign-in drives cross-device sync.
     The session persists on the device, so signing in once is enough. */
  function mountAccount() {
    var bar = document.querySelector('.topbar');
    if (!bar || !global.Auth || !global.Auth.enabled()) return;

    var btn = el('button', { class: 'ghost account-btn' }, ['Sign in']);
    bar.appendChild(btn);

    var dlg = el('dialog', { id: 'dlg-account' });
    dlg.innerHTML =
      '<div class="modal-head">Account</div>' +
      '<div class="modal-body">' +
      '<p class="hint" id="acc-state"></p>' +
      '<label class="field">Email<input type="email" id="acc-email" autocomplete="username" placeholder="you@example.com"></label>' +
      '<label class="field">Password<input type="password" id="acc-pass" autocomplete="current-password" placeholder="at least 6 characters"></label>' +
      '<p class="hint" id="acc-msg" style="margin-top:10px"></p>' +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="ghost" id="acc-close">Close</button>' +
      '<button class="danger" id="acc-out">Sign out</button>' +
      '<button class="ghost" id="acc-new">Create account</button>' +
      '<button class="primary" id="acc-in">Sign in</button>' +
      '</div>';
    document.body.appendChild(dlg);

    function refreshUi(user) {
      btn.textContent = user && user.email ? user.email.split('@')[0] : (user ? 'Signed in' : 'Sign in');
      var state = dlg.querySelector('#acc-state');
      var out = dlg.querySelector('#acc-out');
      var fields = dlg.querySelectorAll('.field');
      if (state) {
        state.textContent = user
          ? 'Signed in' + (user.email ? ' as ' + user.email : '') + ' — this device stays signed in and syncs automatically.'
          : 'Sign in to sync this device with your other devices. Everything keeps working offline either way.';
      }
      if (out) out.style.display = user ? '' : 'none';
      Array.prototype.forEach.call(fields, function (f) { f.style.display = user ? 'none' : ''; });
      ['#acc-in', '#acc-new'].forEach(function (sel) {
        var b = dlg.querySelector(sel);
        if (b) b.style.display = user ? 'none' : '';
      });
      if (global.Sync) global.Sync.run();
    }

    global.Auth.onChange(refreshUi);

    btn.addEventListener('click', function () { dlg.showModal(); });
    dlg.querySelector('#acc-close').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('#acc-out').addEventListener('click', function () {
      global.Auth.signOut();
      dlg.close();
      if (global.Sync) global.Sync.run();
    });

    function submit(create) {
      var email = dlg.querySelector('#acc-email').value.trim();
      var pass = dlg.querySelector('#acc-pass').value;
      var msg = dlg.querySelector('#acc-msg');
      if (!email || !pass) { msg.textContent = 'Enter your email and password.'; return; }
      msg.textContent = create ? 'Creating account…' : 'Signing in…';
      (create ? global.Auth.signUp(email, pass) : global.Auth.signIn(email, pass))
        .then(function (user) {
          if (user) { msg.textContent = ''; dlg.close(); }
          else msg.textContent = 'Account created — check ' + email + ' to confirm it, then sign in.';
        })
        .catch(function (err) { msg.textContent = err.message; });
    }

    dlg.querySelector('#acc-in').addEventListener('click', function () { submit(false); });
    dlg.querySelector('#acc-new').addEventListener('click', function () { submit(true); });
    dlg.querySelector('#acc-pass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit(false);
    });
  }

  document.addEventListener('DOMContentLoaded', mountAccount);

  global.App = { todayISO: todayISO, num: num, round: round, autosave: autosave, el: el };
})(window);

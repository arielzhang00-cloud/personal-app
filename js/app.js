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

  var DAY_KEY = 'lifehub:day';
  var DAY_RE = /^(19|20|21)\d{2}-\d{2}-\d{2}$/;

  /** The day the whole app is currently looking at: ?d= wins, then a day picked
   *  earlier today on another page, then today. A day picked yesterday is not
   *  carried over, so every page rolls to the new date on the device's clock. */
  function selectedDay() {
    var fromUrl = new URLSearchParams(location.search).get('d');
    if (DAY_RE.test(fromUrl || '')) return fromUrl;
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(DAY_KEY)); } catch (e) { stored = null; }
    if (stored && stored.setOn === todayISO() && DAY_RE.test(stored.day || '')) return stored.day;
    return todayISO();
  }

  /** Makes the current URL point at `day` so the page is shareable and the
   *  choice carries to the other sections. */
  function setSelectedDay(day) {
    var value = DAY_RE.test(day || '') ? day : todayISO();
    try {
      localStorage.setItem(DAY_KEY, JSON.stringify({ day: value, setOn: todayISO() }));
    } catch (e) { /* private mode */ }
    var url = new URL(location.href);
    url.searchParams.set('d', value);
    history.replaceState(null, '', url.toString());
    return value;
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

  /* Landing gate: the app is only shown once a user ID + PIN account is signed in on
     this device. The session persists locally, so this appears once per device. */
  function mountGate() {
    if (!global.Auth || !global.Auth.enabled()) return;

    var gate = el('div', { class: 'gate', id: 'gate' });
    gate.innerHTML =
      '<form class="gate-card" id="gate-form">' +
      '<h2>Life Hub</h2>' +
      '<p class="hint" id="gate-state">Sign in with your user ID and 4-digit PIN.</p>' +
      '<label class="field">User ID<input id="gate-id" autocomplete="username" autocapitalize="none" placeholder="ariel"></label>' +
      '<label class="field">PIN<input id="gate-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="4 digits"></label>' +
      '<p class="hint gate-msg" id="gate-msg"></p>' +
      '<div class="gate-actions">' +
      '<button class="primary" id="gate-in" type="submit">Sign in</button>' +
      '<button class="ghost" id="gate-new" type="button">Create account</button>' +
      '</div>' +
      '</form>';
    document.body.appendChild(gate);

    var idInput = gate.querySelector('#gate-id');
    var pinInput = gate.querySelector('#gate-pin');
    var msg = gate.querySelector('#gate-msg');

    function busy(text) {
      msg.textContent = text;
      gate.querySelector('#gate-in').disabled = !!text;
      gate.querySelector('#gate-new').disabled = !!text;
    }

    function submit(create) {
      var id = idInput.value.trim();
      var pin = pinInput.value.trim();
      if (!id) { msg.textContent = 'Enter a user ID.'; return; }
      if (!/^\d{4}$/.test(pin)) { msg.textContent = 'PIN must be 4 digits.'; return; }
      busy(create ? 'Creating account…' : 'Signing in…');
      (create ? global.Auth.signUp(id, pin) : global.Auth.signIn(id, pin))
        .then(function (user) {
          busy('');
          if (!user) msg.textContent = 'Account created — sign in to continue.';
        })
        .catch(function (err) { busy(''); msg.textContent = err.message; });
    }

    gate.querySelector('#gate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submit(false);
    });
    gate.querySelector('#gate-new').addEventListener('click', function () { submit(true); });

    global.Auth.onChange(function (user) {
      document.body.classList.toggle('locked', !user);
      if (user) { idInput.value = ''; pinInput.value = ''; msg.textContent = ''; }
      if (global.Sync) global.Sync.run();
    });
  }

  /* Account control in the top bar: shows who is signed in and signs out. */
  function mountAccount() {
    var bar = document.querySelector('.topbar');
    if (!bar || !global.Auth || !global.Auth.enabled()) return;

    var btn = el('button', { class: 'ghost account-btn' }, ['Account']);
    bar.appendChild(btn);

    var dlg = el('dialog', { id: 'dlg-account' });
    dlg.innerHTML =
      '<div class="modal-head">Account</div>' +
      '<div class="modal-body"><p class="hint" id="acc-state"></p></div>' +
      '<div class="modal-foot">' +
      '<button class="ghost" id="acc-close">Close</button>' +
      '<button class="danger" id="acc-out">Sign out</button>' +
      '</div>';
    document.body.appendChild(dlg);

    global.Auth.onChange(function (user) {
      btn.textContent = global.Auth.name() || 'Account';
      dlg.querySelector('#acc-state').textContent = user
        ? 'Signed in as ' + (global.Auth.name() || 'you') +
          ' — this device stays signed in and syncs automatically.'
        : 'Signed out.';
    });

    btn.addEventListener('click', function () { dlg.showModal(); });
    dlg.querySelector('#acc-close').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('#acc-out').addEventListener('click', function () {
      // Clear the local copy too, so the next account on this device starts clean.
      global.DB.wipe().then(function () {
        global.Auth.signOut();
        location.reload();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    mountAccount();
    mountGate();
  });

  global.App = {
    todayISO: todayISO,
    selectedDay: selectedDay,
    setSelectedDay: setSelectedDay,
    num: num,
    round: round,
    autosave: autosave,
    el: el
  };
})(window);

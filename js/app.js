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

  /* Account control in the top bar: magic-link sign-in drives cross-device sync. */
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
      '<label class="field">Email<input type="email" id="acc-email" placeholder="you@example.com"></label>' +
      '<p class="hint" id="acc-msg" style="margin-top:10px"></p>' +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="ghost" id="acc-close">Close</button>' +
      '<button class="danger" id="acc-out">Sign out</button>' +
      '<button class="primary" id="acc-send">Email me a link</button>' +
      '</div>';
    document.body.appendChild(dlg);

    function refreshUi(user) {
      btn.textContent = user && user.email ? user.email.split('@')[0] : (user ? 'Signed in' : 'Sign in');
      var state = dlg.querySelector('#acc-state');
      var out = dlg.querySelector('#acc-out');
      var send = dlg.querySelector('#acc-send');
      if (state) {
        state.textContent = user
          ? 'Signed in' + (user.email ? ' as ' + user.email : '') + ' — your data syncs to every device you sign in on.'
          : 'Sign in to sync this device with your other devices. Everything keeps working offline either way.';
      }
      if (out) out.style.display = user ? '' : 'none';
      if (send) send.style.display = user ? 'none' : '';
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
    dlg.querySelector('#acc-send').addEventListener('click', function () {
      var email = dlg.querySelector('#acc-email').value.trim();
      var msg = dlg.querySelector('#acc-msg');
      if (!email) { msg.textContent = 'Enter your email first.'; return; }
      msg.textContent = 'Sending…';
      global.Auth.signIn(email).then(function () {
        msg.textContent = 'Check ' + email + ' for a sign-in link.';
      }).catch(function (err) {
        msg.textContent = 'Could not send the link: ' + err.message;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', mountAccount);

  global.App = { todayISO: todayISO, num: num, round: round, autosave: autosave, el: el };
})(window);

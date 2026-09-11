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

  global.App = { todayISO: todayISO, num: num, round: round, autosave: autosave, el: el };
})(window);

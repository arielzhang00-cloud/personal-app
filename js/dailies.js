/* Dailies: a fixed checklist that repeats every day. The items live forever;
   only the tick marks are stored per date, so the list comes back unchecked
   once the device's clock rolls over to the next day. */
(function () {
  'use strict';

  var ITEMS = 'daily-items';
  var CHECKS = 'daily-checks';

  var $ = function (id) { return document.getElementById(id); };

  var state = { day: App.selectedDay(), items: [], checks: {} };

  function checkId(itemId, day) { return 'check-' + day + '-' + itemId; }

  function isDone(itemId) {
    var row = state.checks[checkId(itemId, state.day)];
    return !!(row && row.done);
  }

  function setDone(itemId, done) {
    var id = checkId(itemId, state.day);
    return DB.put(CHECKS, { id: id, item: itemId, date: state.day, done: done })
      .then(function () { state.checks[id] = { item: itemId, date: state.day, done: done }; });
  }

  var saveItem = App.autosave(function (item) { DB.put(ITEMS, item); }, 400);

  function cell(label, child) {
    var td = document.createElement('td');
    td.setAttribute('data-label', label);
    if (child) td.appendChild(child);
    return td;
  }

  function renderSummary() {
    var done = state.items.filter(function (i) { return isDone(i.id); }).length;
    $('t-done').textContent = done + ' / ' + state.items.length;
    $('range-label').textContent = new Date(state.day + 'T00:00:00').toDateString();
  }

  function renderTable() {
    var body = $('daily-body');
    body.innerHTML = '';

    if (!state.items.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'empty';
      td.textContent = 'No dailies yet — add the things you want to do every day.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    state.items.forEach(function (item) {
      var tr = document.createElement('tr');
      if (isDone(item.id)) tr.className = 'done';

      var name = App.el('input', { type: 'text', placeholder: 'Item' });
      name.value = item.name || '';
      name.addEventListener('input', function () { item.name = name.value; saveItem(item); });
      tr.appendChild(cell('Item', name));

      var desc = App.el('input', { type: 'text', placeholder: 'Short description' });
      desc.value = item.description || '';
      desc.addEventListener('input', function () { item.description = desc.value; saveItem(item); });
      tr.appendChild(cell('Description', desc));

      var check = App.el('input', { type: 'checkbox' });
      check.checked = isDone(item.id);
      check.addEventListener('change', function () {
        tr.classList.toggle('done', check.checked);
        setDone(item.id, check.checked).then(renderSummary);
      });
      tr.appendChild(cell('Done', check));

      tr.appendChild(cell('', App.el('button', {
        class: 'danger',
        onclick: function () { DB.remove(ITEMS, item.id).then(load); }
      }, ['Delete'])));

      body.appendChild(tr);
    });
  }

  function load() {
    return Promise.all([DB.all(ITEMS), DB.all(CHECKS)]).then(function (res) {
      state.items = res[0].sort(function (a, b) {
        return (a.createdAt || a.updatedAt || '').localeCompare(b.createdAt || b.updatedAt || '');
      });
      state.checks = {};
      res[1].forEach(function (c) { state.checks[c.id] = c; });
      renderSummary();
      renderTable();
    });
  }

  function refresh() {
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT' && active.type === 'text') return;
    load();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('day').value = state.day;
    $('day').addEventListener('change', function () {
      state.day = App.setSelectedDay($('day').value);
      $('day').value = state.day;
      load();
    });

    $('btn-add-row').addEventListener('click', function () {
      DB.put(ITEMS, { name: '', description: '', createdAt: new Date().toISOString() }).then(load);
    });

    load();
  });

  // Keep the day honest if the tab is left open across midnight.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    var current = App.selectedDay();
    if (current === state.day) return;
    state.day = current;
    $('day').value = current;
    load();
  });

  DB.onChange(ITEMS, refresh);
  DB.onChange(CHECKS, refresh);
})();

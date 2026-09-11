/* Whimsy: a keep-forever list of things to do. Checking something greys it out
   and sinks it to the bottom; only Delete removes it. */
(function () {
  'use strict';

  var ITEMS = 'whimsy-items';

  var $ = function (id) { return document.getElementById(id); };

  var COLUMNS = [
    { key: 'name', label: 'Item', type: 'text', placeholder: 'Item' },
    { key: 'date', label: 'Date to do', type: 'date' },
    { key: 'description', label: 'Description', type: 'text', placeholder: 'Short description' },
    { key: 'notes', label: 'Notes', type: 'text', placeholder: 'Notes' },
    { key: 'with', label: 'With who', type: 'text', placeholder: 'With who' }
  ];

  var state = { items: [] };

  var saveItem = App.autosave(function (item) { DB.put(ITEMS, item); }, 400);

  function sorted(items) {
    return items.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;      // done sink to the bottom
      var ad = a.date || '9999-12-31', bd = b.date || '9999-12-31';
      if (ad !== bd) return ad.localeCompare(bd);
      return (a.createdAt || a.updatedAt || '').localeCompare(b.createdAt || b.updatedAt || '');
    });
  }

  function cell(label, child) {
    var td = document.createElement('td');
    td.setAttribute('data-label', label);
    if (child) td.appendChild(child);
    return td;
  }

  function renderSummary() {
    var done = state.items.filter(function (i) { return i.done; }).length;
    $('t-open').textContent = state.items.length - done;
    $('t-done').textContent = done;
  }

  function renderTable() {
    var body = $('whimsy-body');
    body.innerHTML = '';

    if (!state.items.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'empty';
      td.textContent = 'Nothing on the list yet — add something you want to do.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    sorted(state.items).forEach(function (item) {
      var row = document.createElement('tr');
      if (item.done) row.className = 'done';

      COLUMNS.forEach(function (col) {
        var input = App.el('input', { type: col.type, placeholder: col.placeholder || '' });
        input.value = item[col.key] === undefined || item[col.key] === null ? '' : item[col.key];
        input.addEventListener(col.type === 'date' ? 'change' : 'input', function () {
          item[col.key] = input.value;
          if (col.type === 'date') DB.put(ITEMS, item).then(load);
          else saveItem(item);
        });
        row.appendChild(cell(col.label, input));
      });

      var check = App.el('input', { type: 'checkbox' });
      check.checked = !!item.done;
      check.addEventListener('change', function () {
        item.done = check.checked;
        DB.put(ITEMS, item).then(load);
      });
      row.appendChild(cell('Done', check));

      row.appendChild(cell('', App.el('button', {
        class: 'danger',
        onclick: function () { DB.remove(ITEMS, item.id).then(load); }
      }, ['Delete'])));

      body.appendChild(row);
    });
  }

  function load() {
    return DB.all(ITEMS).then(function (rows) {
      state.items = rows;
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
    $('btn-add-row').addEventListener('click', function () {
      DB.put(ITEMS, {
        name: '', date: App.selectedDay(), description: '', notes: '', with: '',
        done: false, createdAt: new Date().toISOString()
      }).then(load);
    });

    load();
  });

  DB.onChange(ITEMS, refresh);
})();

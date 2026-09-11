/* Budgeting page: date + daily/weekly/monthly/yearly view, a 100% stacked bar of
   spending by category, and an editable table of items with saved quick-adds.
   Reimbursed items stay in the table but are excluded from the spend totals. */
(function () {
  'use strict';

  var ENTRIES = 'budget-entries';
  var SAVED = 'budget-saved';

  var $ = function (id) { return document.getElementById(id); };
  var num = App.num, round = App.round;

  var COLORS = ['#4da3ff', '#f2b544', '#5fd39b', '#f2726f', '#b78bff', '#4fd2e0', '#f58fc2', '#9ab04a'];

  var state = { day: App.selectedDay(), view: 'month', entries: [], saved: [] };

  /* ---------------- range ---------------- */

  function parse(iso) { return new Date(iso + 'T00:00:00'); }

  function iso(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /** Inclusive [start, end] ISO dates covered by the current view. */
  function range() {
    var d = parse(state.day);
    if (state.view === 'day') return { start: state.day, end: state.day };
    if (state.view === 'week') {
      var back = (d.getDay() + 6) % 7; // weeks start Monday
      var start = new Date(d.getTime() - back * 86400000);
      return { start: iso(start), end: iso(new Date(start.getTime() + 6 * 86400000)) };
    }
    if (state.view === 'month') {
      return {
        start: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
        end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      };
    }
    return { start: iso(new Date(d.getFullYear(), 0, 1)), end: iso(new Date(d.getFullYear(), 11, 31)) };
  }

  function inRange(entry) {
    var r = range();
    return entry.date >= r.start && entry.date <= r.end;
  }

  function rangeLabel() {
    var r = range();
    var d = parse(state.day);
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    if (state.view === 'day') return d.toDateString();
    if (state.view === 'month') return months[d.getMonth()] + ' ' + d.getFullYear();
    if (state.view === 'year') return String(d.getFullYear());
    return parse(r.start).toDateString() + ' – ' + parse(r.end).toDateString();
  }

  /* ---------------- money ---------------- */

  function money(n) {
    return '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function lineTotal(entry) {
    var qty = entry.qty === '' || entry.qty === undefined || entry.qty === null ? 1 : num(entry.qty);
    return num(entry.price) * qty;
  }

  function visible() {
    return state.entries.filter(inRange).sort(function (a, b) {
      return a.date === b.date
        ? (a.updatedAt || '').localeCompare(b.updatedAt || '')
        : a.date.localeCompare(b.date);
    });
  }

  function byCategory(rows) {
    var totals = {};
    rows.forEach(function (e) {
      if (e.reimbursed) return;
      var cat = (e.category || '').trim() || 'Uncategorized';
      totals[cat] = (totals[cat] || 0) + lineTotal(e);
    });
    return Object.keys(totals)
      .map(function (cat) { return { category: cat, amount: totals[cat] }; })
      .filter(function (c) { return c.amount > 0; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  /* ---------------- summary + stacked bar ---------------- */

  function renderSummary() {
    var rows = visible();
    var spent = 0, reimbursed = 0, qty = 0;
    rows.forEach(function (e) {
      var t = lineTotal(e);
      if (e.reimbursed) reimbursed += t; else spent += t;
      qty += e.qty === '' || e.qty === undefined || e.qty === null ? 1 : num(e.qty);
    });

    $('t-spend').textContent = money(spent);
    $('t-reimb').textContent = money(reimbursed);
    $('t-items').textContent = rows.length;
    $('f-qty').textContent = round(qty, 2);
    $('f-total').textContent = money(spent);
    $('range-label').textContent = rangeLabel();

    var bar = $('stackbar');
    var legend = $('legend');
    bar.innerHTML = '';
    legend.innerHTML = '';

    var cats = byCategory(rows);
    if (!spent) {
      bar.classList.add('empty-bar');
      legend.innerHTML = '<div class="empty">No spending in this range yet.</div>';
      return;
    }
    bar.classList.remove('empty-bar');

    cats.forEach(function (c, i) {
      var pct = (c.amount / spent) * 100;
      var color = COLORS[i % COLORS.length];

      var seg = App.el('div', {
        class: 'stack-seg',
        style: 'width:' + pct + '%;background:' + color,
        title: c.category + ' · ' + money(c.amount) + ' · ' + round(pct, 1) + '%'
      }, [pct >= 9 ? money(c.amount) + ' · ' + round(pct, 0) + '%' : '']);
      bar.appendChild(seg);

      legend.appendChild(App.el('div', { class: 'legend-item' }, [
        App.el('span', { class: 'swatch', style: 'background:' + color }),
        App.el('span', { class: 'legend-name' }, [c.category]),
        App.el('span', { class: 'legend-val' }, [money(c.amount) + ' · ' + round(pct, 1) + '%'])
      ]));
    });
  }

  /* ---------------- table ---------------- */

  var saveEntry = App.autosave(function (entry) { DB.put(ENTRIES, entry); }, 400);

  function cell(label, child) {
    var td = document.createElement('td');
    td.setAttribute('data-label', label);
    if (child) td.appendChild(child);
    return td;
  }

  function renderTable() {
    var body = $('spend-body');
    var rows = visible();
    body.innerHTML = '';

    // The date column only matters once the view spans more than one day.
    $('spend-table').classList.toggle('no-date', state.view === 'day');

    if (!rows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'empty';
      td.textContent = 'Nothing logged in this range — add a row or pick a saved item.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    rows.forEach(function (entry) {
      var tr = document.createElement('tr');
      if (entry.reimbursed) tr.className = 'reimbursed';

      var date = App.el('input', { type: 'date', value: entry.date });
      date.addEventListener('change', function () {
        entry.date = date.value || state.day;
        DB.put(ENTRIES, entry).then(load);
      });
      var dateCell = cell('Date', date);
      dateCell.className = 'col-date';
      tr.appendChild(dateCell);

      var name = App.el('input', { type: 'text', placeholder: 'Item' });
      name.value = entry.name || '';
      name.addEventListener('input', function () { entry.name = name.value; saveEntry(entry); });
      tr.appendChild(cell('Item', name));

      var cat = App.el('input', { type: 'text', list: 'cat-list', placeholder: 'Category' });
      cat.value = entry.category || '';
      cat.addEventListener('input', function () {
        entry.category = cat.value;
        renderSummary();
        saveEntry(entry);
      });
      tr.appendChild(cell('Category', cat));

      var price = App.el('input', { type: 'number', step: '0.01', inputmode: 'decimal', placeholder: '0.00' });
      price.value = entry.price === undefined || entry.price === null ? '' : entry.price;
      tr.appendChild(cell('Price', price));

      var qty = App.el('input', { type: 'number', step: '1', inputmode: 'numeric', placeholder: '1' });
      qty.value = entry.qty === undefined || entry.qty === null ? '' : entry.qty;
      tr.appendChild(cell('Quantity', qty));

      var total = cell('Total', null);
      total.className = 'line-total';
      total.textContent = money(lineTotal(entry));
      tr.appendChild(total);

      [price, qty].forEach(function (input) {
        input.addEventListener('input', function () {
          entry.price = price.value;
          entry.qty = qty.value;
          total.textContent = money(lineTotal(entry));
          renderSummary();
          saveEntry(entry);
        });
      });

      var reimb = App.el('input', { type: 'checkbox' });
      reimb.checked = !!entry.reimbursed;
      reimb.addEventListener('change', function () {
        entry.reimbursed = reimb.checked;
        tr.classList.toggle('reimbursed', reimb.checked);
        renderSummary();
        DB.put(ENTRIES, entry);
      });
      tr.appendChild(cell('Reimbursed', reimb));

      tr.appendChild(cell('', App.el('button', {
        class: 'danger',
        onclick: function () { DB.remove(ENTRIES, entry.id).then(load); }
      }, ['Delete'])));

      body.appendChild(tr);
    });
  }

  function addEntry(values) {
    var entry = Object.assign(
      { date: state.day, name: '', category: '', price: '', qty: 1, reimbursed: false },
      values
    );
    return DB.put(ENTRIES, entry).then(load);
  }

  /* ---------------- saved items ---------------- */

  function categories() {
    var seen = {};
    state.saved.concat(state.entries).forEach(function (r) {
      var c = (r.category || '').trim();
      if (c) seen[c] = true;
    });
    return Object.keys(seen).sort();
  }

  function renderPickers() {
    var list = $('quick-list');
    list.innerHTML = '';
    state.saved.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.name;
        opt.label = money(num(item.price)) + (item.category ? ' · ' + item.category : '');
        list.appendChild(opt);
      });

    var cats = $('cat-list');
    cats.innerHTML = '';
    categories().forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      cats.appendChild(opt);
    });
  }

  function renderSavedManager() {
    var wrap = $('s-list');
    wrap.innerHTML = '';
    if (!state.saved.length) {
      wrap.innerHTML = '<div class="empty">No saved items yet.</div>';
      return;
    }
    state.saved.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (item) {
        wrap.appendChild(App.el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, [
          App.el('div', {}, [
            App.el('div', { style: 'font-weight:600' }, [item.name]),
            App.el('div', { class: 'hint' }, [money(num(item.price)) + ' each' + (item.category ? ' · ' + item.category : '')])
          ]),
          App.el('div', { class: 'row' }, [
            App.el('button', {
              class: 'ghost',
              onclick: function () { $('dlg-saved').close(); openItemDialog(item); }
            }, ['Edit']),
            App.el('button', {
              class: 'danger',
              onclick: function () { DB.remove(SAVED, item.id).then(load).then(renderSavedManager); }
            }, ['Delete'])
          ])
        ]));
      });
  }

  /* ---------------- item popup ---------------- */

  var editing = null;

  function openItemDialog(item) {
    editing = item && item.id ? item : null;
    $('dlg-item-title').textContent = item && item.name ? item.name : 'New item';
    $('i-name').value = (item && item.name) || '';
    $('i-cat').value = (item && item.category) || '';
    $('i-price').value = item && item.price !== undefined ? item.price : 0;
    $('a-qty').value = 1;
    $('a-reimb').checked = false;
    updatePreview();
    $('dlg-item').showModal();
  }

  function updatePreview() {
    var qty = num($('a-qty').value) || 0;
    var total = num($('i-price').value) * qty;
    $('a-preview').textContent = qty
      ? 'Adds ' + qty + ' × ' + money(num($('i-price').value)) + ' = ' + money(total) +
        ($('a-reimb').checked ? ' (reimbursed — not counted in spend)' : '')
      : 'Enter a quantity to add this to the selected date.';
  }

  function saveItemFromDialog() {
    var item = {
      id: editing ? editing.id : undefined,
      name: $('i-name').value.trim(),
      category: $('i-cat').value.trim(),
      price: num($('i-price').value)
    };
    if (!item.name) return Promise.resolve(null);
    return DB.put(SAVED, item).then(function (id) {
      item.id = id;
      return item;
    });
  }

  /* ---------------- load / wire ---------------- */

  function load() {
    return Promise.all([DB.all(ENTRIES), DB.all(SAVED)]).then(function (res) {
      state.entries = res[0];
      state.saved = res[1];
      renderSummary();
      renderTable();
      renderPickers();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('day').value = state.day;
    $('day').addEventListener('change', function () {
      state.day = App.setSelectedDay($('day').value);
      $('day').value = state.day;
      renderSummary();
      renderTable();
    });

    Array.prototype.forEach.call($('views').querySelectorAll('button'), function (btn) {
      btn.addEventListener('click', function () {
        state.view = btn.dataset.view;
        Array.prototype.forEach.call($('views').querySelectorAll('button'), function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        renderSummary();
        renderTable();
      });
    });

    $('btn-add-row').addEventListener('click', function () { addEntry({}); });

    $('quick-picker').addEventListener('change', function () {
      var name = $('quick-picker').value.trim();
      if (!name) return;
      var item = state.saved.filter(function (s) { return s.name.toLowerCase() === name.toLowerCase(); })[0];
      $('quick-picker').value = '';
      openItemDialog(item || { name: name, category: '', price: 0 });
    });

    ['i-price', 'a-qty'].forEach(function (id) { $(id).addEventListener('input', updatePreview); });
    $('a-reimb').addEventListener('change', updatePreview);

    $('dlg-item').addEventListener('close', function () {
      var action = $('dlg-item').returnValue;
      if (action !== 'save' && action !== 'add') return;
      var qty = num($('a-qty').value) || 1;
      var reimbursed = $('a-reimb').checked;
      saveItemFromDialog().then(function (item) {
        if (action === 'add' && item) {
          return addEntry({
            name: item.name, category: item.category, price: item.price,
            qty: qty, reimbursed: reimbursed
          });
        }
        return load();
      });
    });

    $('btn-quick').addEventListener('click', function () {
      renderSavedManager();
      $('dlg-saved').showModal();
    });
    $('s-close').addEventListener('click', function () { $('dlg-saved').close(); });

    $('s-add').addEventListener('click', function () {
      var name = $('s-name').value.trim();
      if (!name) { $('s-name').focus(); return; }
      DB.put(SAVED, {
        name: name,
        category: $('s-cat').value.trim(),
        price: num($('s-price').value)
      }).then(load).then(function () {
        $('s-name').value = '';
        $('s-cat').value = '';
        $('s-price').value = 0;
        renderSavedManager();
      });
    });

    // Re-render on remote pulls, but never while a field is being edited.
    function refresh() {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) return;
      load();
    }
    DB.onChange(ENTRIES, refresh);
    DB.onChange(SAVED, refresh);
    load();
  });
})();

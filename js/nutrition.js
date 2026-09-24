/* Nutrition page: day picker + weight, live totals, saved-item library,
   editable food table and a weight chart with range toggles. */
(function () {
  'use strict';

  var ENTRIES = 'nutrition-entries';
  var SAVED = 'saved-items';
  var WEIGHTS = 'weights';
  var MEASURES = 'measurements';

  var SITES = [
    { key: 'leftArm', label: 'Left arm', color: '#4da3ff' },
    { key: 'rightArm', label: 'Right arm', color: '#7ee081' },
    { key: 'waist', label: 'Waist', color: '#ffb057' },
    { key: 'neck', label: 'Neck', color: '#ff7b7b' },
    { key: 'leftThigh', label: 'Left thigh', color: '#9d7bff' },
    { key: 'rightThigh', label: 'Right thigh', color: '#42d4c4' },
    { key: 'leftAnkle', label: 'Left ankle', color: '#f28fd0' },
    { key: 'rightAnkle', label: 'Right ankle', color: '#c9d44a' }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var num = App.num, round = App.round;

  var state = {
    day: App.selectedDay(),
    entries: [], saved: [], weights: [], measures: [],
    range: 7, mRange: 7
  };

  /* ---------------- totals ---------------- */

  function renderTotals() {
    var cal = 0, pro = 0, fib = 0;
    state.entries.forEach(function (e) {
      cal += num(e.calories); pro += num(e.protein); fib += num(e.fiber);
    });
    $('t-cal').textContent = round(cal, 0);
    $('t-pro').textContent = round(pro, 1);
    $('t-fib').textContent = round(fib, 1);
    $('f-cal').textContent = round(cal, 0);
    $('f-pro').textContent = round(pro, 1);
    $('f-fib').textContent = round(fib, 1);
    var w = weightFor(state.day);
    $('t-wt').textContent = w === null ? '—' : round(w, 1);
  }

  function weightFor(day) {
    var row = state.weights.filter(function (w) { return w.date === day; })[0];
    return row && row.weight !== '' && row.weight !== null && row.weight !== undefined
      ? num(row.weight) : null;
  }

  /* ---------------- food table ---------------- */

  var COLUMNS = [
    { key: 'name', label: 'Item', type: 'text' },
    { key: 'grams', label: 'Quantity (g)', type: 'number' },
    { key: 'count', label: 'Quantity (ct)', type: 'number' },
    { key: 'calories', label: 'Calories', type: 'number' },
    { key: 'protein', label: 'Protein', type: 'number' },
    { key: 'fiber', label: 'Fiber', type: 'number' }
  ];

  /** The saved item a row came from, matched by id and falling back to the
   *  name so rows logged before an item was saved still rescale. */
  function savedFor(entry) {
    var byId = entry.savedId && state.saved.filter(function (s) { return s.id === entry.savedId; })[0];
    if (byId) return byId;
    var name = (entry.name || '').trim().toLowerCase();
    if (!name) return null;
    return state.saved.filter(function (s) { return (s.name || '').toLowerCase() === name; })[0] || null;
  }

  /** Recomputes calories/protein/fiber from the saved item's per-serving values. */
  function rescale(entry) {
    var item = savedFor(entry);
    if (!item) return false;
    var serving = num(item.serving) || 1;
    var qty = item.basis === 'g' ? num(entry.grams) : num(entry.count);
    if (!qty) qty = num(entry.grams) || num(entry.count);
    var factor = qty / serving;
    entry.calories = round(num(item.calories) * factor, 1);
    entry.protein = round(num(item.protein) * factor, 1);
    entry.fiber = round(num(item.fiber) * factor, 1);
    return true;
  }

  function renderTable() {
    var body = $('food-body');
    body.innerHTML = '';
    if (!state.entries.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'empty';
      td.textContent = 'Nothing logged yet — add a row or pick a saved item.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    state.entries.forEach(function (entry) {
      var tr = document.createElement('tr');
      var inputs = {};
      COLUMNS.forEach(function (col) {
        var td = document.createElement('td');
        td.setAttribute('data-label', col.label);
        var input = document.createElement('input');
        input.type = col.type;
        if (col.type === 'number') { input.step = '0.01'; input.inputMode = 'decimal'; }
        input.value = entry[col.key] === undefined || entry[col.key] === null ? '' : entry[col.key];
        input.addEventListener('input', function () {
          entry[col.key] = input.value;
          if ((col.key === 'grams' || col.key === 'count') && rescale(entry)) {
            ['calories', 'protein', 'fiber'].forEach(function (k) {
              if (inputs[k]) inputs[k].value = entry[k];
            });
          }
          renderTotals();
          saveEntry(entry);
        });
        inputs[col.key] = input;
        td.appendChild(input);
        tr.appendChild(td);
      });
      var actions = document.createElement('td');
      actions.setAttribute('data-label', '');
      var del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Delete';
      del.addEventListener('click', function () {
        DB.remove(ENTRIES, entry.id).then(load);
      });
      actions.appendChild(del);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
  }

  var saveEntry = App.autosave(function (entry) {
    DB.put(ENTRIES, entry);
  }, 400);

  function addEntry(values) {
    var entry = Object.assign({ date: state.day, name: '', grams: '', count: '', calories: '', protein: '', fiber: '' }, values);
    return DB.put(ENTRIES, entry).then(load);
  }

  /* ---------------- saved items ---------------- */

  function renderSavedOptions() {
    var list = $('saved-list');
    list.innerHTML = '';
    state.saved.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.name;
        opt.label = round(num(item.calories), 0) + ' cal / ' + item.serving + (item.basis === 'g' ? 'g' : ' ct');
        list.appendChild(opt);
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
        var row = App.el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, [
          App.el('div', {}, [
            App.el('div', { style: 'font-weight:600' }, [item.name]),
            App.el('div', { class: 'hint' }, [
              'per ' + item.serving + (item.basis === 'g' ? ' g' : ' ct') + ' · ' +
              round(num(item.calories), 0) + ' cal · ' + round(num(item.protein), 1) + 'p · ' +
              round(num(item.fiber), 1) + 'f'
            ])
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
        ]);
        wrap.appendChild(row);
      });
  }

  /* ---------------- item popup ---------------- */

  var editing = null;

  function openItemDialog(item) {
    editing = item || null;
    $('dlg-item-title').textContent = item ? item.name : 'New item';
    $('i-name').value = item ? item.name : '';
    $('i-basis').value = item ? item.basis : 'g';
    $('i-serving').value = item ? item.serving : 100;
    $('i-cal').value = item ? item.calories : 0;
    $('i-pro').value = item ? item.protein : 0;
    $('i-fib').value = item ? item.fiber : 0;
    $('a-g').value = '';
    $('a-ct').value = '';
    updatePreview();
    $('dlg-item').showModal();
  }

  function scaled() {
    var basis = $('i-basis').value;
    var serving = num($('i-serving').value) || 1;
    var qty = basis === 'g' ? num($('a-g').value) : num($('a-ct').value);
    if (!qty) qty = num($('a-g').value) || num($('a-ct').value);
    var factor = qty / serving;
    return {
      factor: factor,
      grams: $('a-g').value,
      count: $('a-ct').value,
      calories: round(num($('i-cal').value) * factor, 1),
      protein: round(num($('i-pro').value) * factor, 1),
      fiber: round(num($('i-fib').value) * factor, 1)
    };
  }

  function updatePreview() {
    var s = scaled();
    $('a-preview').textContent = s.factor
      ? 'Adds ' + s.calories + ' cal · ' + s.protein + ' g protein · ' + s.fiber + ' g fiber'
      : 'Enter a quantity to add this to today.';
  }

  ['i-basis', 'i-serving', 'i-cal', 'i-pro', 'i-fib', 'a-g', 'a-ct'].forEach(function (id) {
    document.addEventListener('DOMContentLoaded', function () {
      $(id).addEventListener('input', updatePreview);
    });
  });

  function saveItemFromDialog() {
    var item = {
      id: editing ? editing.id : undefined,
      name: $('i-name').value.trim(),
      basis: $('i-basis').value,
      serving: num($('i-serving').value) || 1,
      calories: num($('i-cal').value),
      protein: num($('i-pro').value),
      fiber: num($('i-fib').value)
    };
    if (!item.name) return Promise.resolve(null);
    return DB.put(SAVED, item).then(function (id) {
      item.id = id;
      return item;
    });
  }

  /* ---------------- charts ---------------- */

  /** Day-indexed points for one field of a dated collection, over the `days`
   *  window ending on the selected day. */
  function seriesPoints(rows, key, days) {
    var end = new Date(state.day + 'T00:00:00');
    var start = new Date(end.getTime() - (days - 1) * 86400000);
    return rows
      .filter(function (r) {
        var d = new Date(r.date + 'T00:00:00');
        return d >= start && d <= end &&
          r[key] !== '' && r[key] !== null && r[key] !== undefined;
      })
      .map(function (r) { return { t: new Date(r.date + 'T00:00:00').getTime(), v: num(r[key]) }; })
      .sort(function (a, b) { return a.t - b.t; });
  }

  /** Draws any number of lines sharing one axis. Returns false when nothing
   *  in the window has data. */
  function drawLines(canvas, series, days, emptyText) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 320;
    var cssH = 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var drawn = series.filter(function (s) { return s.points.length; });
    if (!drawn.length) {
      ctx.fillStyle = '#97a3b0';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(emptyText, cssW / 2, cssH / 2);
      return false;
    }

    var padL = 44, padR = 12, padT = 14, padB = 26;
    var w = cssW - padL - padR, h = cssH - padT - padB;
    var end = new Date(state.day + 'T00:00:00').getTime();
    var start = end - (days - 1) * 86400000;

    var vals = [];
    drawn.forEach(function (s) {
      s.points.forEach(function (p) { vals.push(p.v); });
    });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max - min < 1) { min -= 1; max += 1; }
    var padV = (max - min) * 0.12;
    min -= padV; max += padV;

    var x = function (t) { return padL + (days === 1 ? w / 2 : ((t - start) / (end - start)) * w); };
    var y = function (v) { return padT + h - ((v - min) / (max - min)) * h; };

    ctx.strokeStyle = '#2b343e';
    ctx.fillStyle = '#97a3b0';
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var v = min + ((max - min) * i) / 4;
      var yy = y(v);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + w, yy); ctx.stroke();
      ctx.fillText(round(v, 1), padL - 8, yy);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [start, (start + end) / 2, end].forEach(function (t) {
      var d = new Date(t);
      ctx.fillText((d.getMonth() + 1) + '/' + d.getDate(), x(t), padT + h + 7);
    });

    drawn.forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.points.forEach(function (p, i) {
        var px = x(p.t), py = y(p.v);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();

      ctx.fillStyle = s.color;
      s.points.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(x(p.t), y(p.v), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    return true;
  }

  function drawChart() {
    var pts = seriesPoints(state.weights, 'weight', state.range);
    var ok = drawLines(
      $('weight-chart'),
      [{ label: 'Weight', color: '#4da3ff', points: pts }],
      state.range,
      'No weight logged in this range yet.'
    );
    if (!ok) { $('chart-hint').textContent = ''; return; }
    var first = pts[0].v, last = pts[pts.length - 1].v;
    var delta = round(last - first, 1);
    $('chart-hint').textContent = pts.length + ' entries · ' + round(first, 1) + ' → ' +
      round(last, 1) + ' lb (' + (delta > 0 ? '+' : '') + delta + ')';
  }

  /* ---------------- body measurements ---------------- */

  function measureFor(day) {
    return state.measures.filter(function (m) { return m.date === day; })[0] || null;
  }

  function renderMeasureInputs() {
    var wrap = $('measure-inputs');
    var row = measureFor(state.day) || {};
    if (!wrap.childNodes.length) {
      SITES.forEach(function (site) {
        var input = App.el('input', {
          type: 'number', id: 'm-' + site.key, step: '0.1',
          inputmode: 'decimal', placeholder: '—'
        });
        input.addEventListener('input', function () { saveMeasure(site.key, input.value); });
        var label = App.el('label', { class: 'field' }, [
          App.el('span', { class: 'legend-item' }, [
            App.el('span', { class: 'swatch', style: 'background:' + site.color }),
            site.label
          ])
        ]);
        label.appendChild(input);
        wrap.appendChild(label);
      });
    }
    SITES.forEach(function (site) {
      var input = $('m-' + site.key);
      if (document.activeElement === input) return;
      var v = row[site.key];
      input.value = v === undefined || v === null ? '' : v;
    });
  }

  /* One row per day holds every site, so the value is applied immediately and
     only the write is debounced — otherwise a quick edit to a second site
     would replace the first one's pending save. */
  function saveMeasure(key, value) {
    var row = measureFor(state.day);
    if (!row) {
      row = { id: 'measure-' + state.day, date: state.day };
      state.measures.push(row);
    }
    row[key] = value;
    drawMeasureChart();
    writeMeasure(row);
  }

  var writeMeasure = App.autosave(function (row) { DB.put(MEASURES, row); }, 400);

  function drawMeasureChart() {
    var series = SITES.map(function (site) {
      return {
        label: site.label,
        color: site.color,
        points: seriesPoints(state.measures, site.key, state.mRange)
      };
    });
    var ok = drawLines(
      $('measure-chart'), series, state.mRange,
      'No measurements logged in this range yet.'
    );

    var legend = $('measure-legend');
    legend.innerHTML = '';
    var logged = 0;
    series.forEach(function (s) {
      if (!s.points.length) return;
      logged++;
      legend.appendChild(App.el('span', { class: 'legend-item' }, [
        App.el('span', { class: 'swatch', style: 'background:' + s.color }),
        s.label + ' ' + round(s.points[s.points.length - 1].v, 1)
      ]));
    });
    $('measure-hint').textContent = ok ? logged + ' of ' + SITES.length + ' tracked in this range' : '';
  }

  /* ---------------- load / wire ---------------- */

  function load() {
    return Promise.all([DB.all(ENTRIES), DB.all(SAVED), DB.all(WEIGHTS), DB.all(MEASURES)])
      .then(function (res) {
        state.entries = res[0].filter(function (e) { return e.date === state.day; })
          .sort(function (a, b) { return (a.updatedAt || '').localeCompare(b.updatedAt || ''); });
        state.saved = res[1];
        state.weights = res[2];
        state.measures = res[3];
        var w = weightFor(state.day);
        if (document.activeElement !== $('weight')) $('weight').value = w === null ? '' : w;
        renderTotals();
        renderTable();
        renderSavedOptions();
        drawChart();
        renderMeasureInputs();
        drawMeasureChart();
      });
  }

  var saveWeight = App.autosave(function (value) {
    DB.put(WEIGHTS, { id: 'weight-' + state.day, date: state.day, weight: value })
      .then(function () {
        return DB.all(WEIGHTS).then(function (rows) {
          state.weights = rows;
          renderTotals();
          drawChart();
        });
      });
  }, 400);

  document.addEventListener('DOMContentLoaded', function () {
    $('day').value = state.day;
    $('day').addEventListener('change', function () {
      state.day = App.setSelectedDay($('day').value);
      $('day').value = state.day;
      load();
    });

    $('weight').addEventListener('input', function () {
      saveWeight($('weight').value);
    });

    $('btn-add-row').addEventListener('click', function () { addEntry({}); });

    $('saved-picker').addEventListener('change', function () {
      var name = $('saved-picker').value.trim();
      if (!name) return;
      var item = state.saved.filter(function (s) { return s.name.toLowerCase() === name.toLowerCase(); })[0];
      $('saved-picker').value = '';
      openItemDialog(item || { name: name, basis: 'g', serving: 100, calories: 0, protein: 0, fiber: 0 });
    });

    $('btn-saved').addEventListener('click', function () {
      renderSavedManager();
      $('dlg-saved').showModal();
    });
    $('s-close').addEventListener('click', function () { $('dlg-saved').close(); });

    $('s-add').addEventListener('click', function () {
      var name = $('s-name').value.trim();
      if (!name) { $('s-name').focus(); return; }
      DB.put(SAVED, {
        name: name,
        basis: $('s-basis').value,
        serving: num($('s-serving').value) || 1,
        calories: num($('s-cal').value),
        protein: num($('s-pro').value),
        fiber: num($('s-fib').value)
      }).then(load).then(function () {
        ['s-name'].forEach(function (id) { $(id).value = ''; });
        ['s-cal', 's-pro', 's-fib'].forEach(function (id) { $(id).value = 0; });
        $('s-serving').value = 100;
        renderSavedManager();
      });
    });

    $('dlg-item').addEventListener('close', function () {
      var action = $('dlg-item').returnValue;
      if (action !== 'save' && action !== 'add') return;
      var payload = scaled();
      saveItemFromDialog().then(function (item) {
        if (action === 'add' && item) {
          return addEntry({
            name: item.name,
            savedId: item.id,
            grams: payload.grams,
            count: payload.count,
            calories: payload.calories,
            protein: payload.protein,
            fiber: payload.fiber
          });
        }
        return load();
      });
    });

    window.addEventListener('resize', App.autosave(function () {
      drawChart();
      drawMeasureChart();
    }, 150));

    function wireRanges(id, apply) {
      var buttons = $(id).querySelectorAll('button');
      Array.prototype.forEach.call(buttons, function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(buttons, function (b) {
            b.setAttribute('aria-pressed', String(b === btn));
          });
          apply(parseInt(btn.dataset.range, 10));
        });
      });
    }

    wireRanges('ranges', function (days) { state.range = days; drawChart(); });
    wireRanges('m-ranges', function (days) { state.mRange = days; drawMeasureChart(); });

    DB.onChange(ENTRIES, function () {});
    load();
  });
})();

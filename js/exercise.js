/* Exercise: workouts you create, each holding a table of exercise, weight,
   sets and reps. The picked workout is remembered on the device. */
(function () {
  'use strict';

  var WORKOUTS = 'workouts';
  var MOVES = 'workout-exercises';
  var PICKED = 'lifehub:workout';

  var $ = function (id) { return document.getElementById(id); };
  var num = App.num;
  var round = App.round;

  var COLUMNS = [
    { key: 'name', label: 'Exercise', type: 'text', placeholder: 'Exercise' },
    { key: 'weight', label: 'Weight', type: 'number' },
    { key: 'sets', label: 'Sets', type: 'number' },
    { key: 'reps', label: 'Reps', type: 'number' }
  ];

  var state = { workouts: [], moves: [], workout: null };

  var saveMove = App.autosave(function (move) { DB.put(MOVES, move); }, 400);
  var saveWorkout = App.autosave(function (workout) { DB.put(WORKOUTS, workout); }, 400);

  function byCreated(a, b) {
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  }

  function current() {
    return state.workouts.filter(function (w) { return w.id === state.workout; })[0] || null;
  }

  function moves() {
    return state.moves
      .filter(function (m) { return m.workout === state.workout; })
      .sort(byCreated);
  }

  function pick(id) {
    state.workout = id || null;
    try {
      if (id) localStorage.setItem(PICKED, id);
      else localStorage.removeItem(PICKED);
    } catch (e) { /* private mode */ }
  }

  function cell(label, child) {
    var td = document.createElement('td');
    td.setAttribute('data-label', label);
    if (child) td.appendChild(child);
    return td;
  }

  function renderPicker() {
    var picker = $('workout-picker');
    picker.innerHTML = '';
    if (!state.workouts.length) {
      picker.appendChild(App.el('option', { value: '' }, ['No workouts yet']));
      picker.disabled = true;
    } else {
      picker.disabled = false;
      state.workouts.slice().sort(byCreated).forEach(function (w) {
        picker.appendChild(App.el('option', { value: w.id }, [w.name || 'Untitled workout']));
      });
    }
    picker.value = state.workout || '';
    var workout = current();
    $('workout-name').value = workout ? (workout.name || '') : '';
    $('workout-name').disabled = !workout;
    $('btn-delete-workout').disabled = !workout;
    $('btn-add-row').disabled = !workout;
  }

  function renderTotals() {
    var rows = moves();
    var sets = 0;
    var volume = 0;
    rows.forEach(function (m) {
      sets += num(m.sets);
      volume += num(m.weight) * num(m.sets) * num(m.reps);
    });
    $('t-exercises').textContent = rows.length;
    $('t-sets').textContent = round(sets, 0);
    $('t-volume').textContent = round(volume, 0);
  }

  function renderTable() {
    var body = $('exercise-body');
    body.innerHTML = '';

    var rows = moves();
    if (!rows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'empty';
      td.textContent = state.workout
        ? 'No exercises yet — add one.'
        : 'Create a workout to start adding exercises.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    rows.forEach(function (move) {
      var row = document.createElement('tr');

      COLUMNS.forEach(function (col) {
        var input = App.el('input', { type: col.type, placeholder: col.placeholder || '' });
        if (col.type === 'number') { input.step = '0.5'; input.inputMode = 'decimal'; }
        input.value = move[col.key] === undefined || move[col.key] === null ? '' : move[col.key];
        input.addEventListener('input', function () {
          move[col.key] = input.value;
          renderTotals();
          saveMove(move);
        });
        row.appendChild(cell(col.label, input));
      });

      row.appendChild(cell('', App.el('button', {
        class: 'danger',
        onclick: function () { DB.remove(MOVES, move.id).then(load); }
      }, ['Delete'])));

      body.appendChild(row);
    });
  }

  function render() {
    renderPicker();
    renderTotals();
    renderTable();
  }

  function load() {
    return Promise.all([DB.all(WORKOUTS), DB.all(MOVES)]).then(function (res) {
      state.workouts = res[0];
      state.moves = res[1];
      if (!current()) {
        var stored = null;
        try { stored = localStorage.getItem(PICKED); } catch (e) { stored = null; }
        var known = state.workouts.filter(function (w) { return w.id === stored; })[0];
        var first = state.workouts.slice().sort(byCreated)[0];
        pick(known ? known.id : (first ? first.id : null));
      }
      render();
    });
  }

  function refresh() {
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT') return;
    load();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('workout-picker').addEventListener('change', function () {
      pick($('workout-picker').value);
      render();
    });

    $('workout-name').addEventListener('input', function () {
      var workout = current();
      if (!workout) return;
      workout.name = $('workout-name').value;
      var option = $('workout-picker').querySelector('option[value="' + workout.id + '"]');
      if (option) option.textContent = workout.name || 'Untitled workout';
      saveWorkout(workout);
    });

    $('btn-new-workout').addEventListener('click', function () {
      DB.put(WORKOUTS, { name: '', createdAt: new Date().toISOString() }).then(function (id) {
        pick(id);
        return load();
      }).then(function () { $('workout-name').focus(); });
    });

    $('btn-delete-workout').addEventListener('click', function () {
      var workout = current();
      if (!workout) return;
      var removals = moves().map(function (m) { return DB.remove(MOVES, m.id); });
      Promise.all(removals)
        .then(function () { return DB.remove(WORKOUTS, workout.id); })
        .then(function () { pick(null); return load(); });
    });

    $('btn-add-row').addEventListener('click', function () {
      if (!state.workout) return;
      DB.put(MOVES, {
        workout: state.workout,
        name: '', weight: '', sets: '', reps: '',
        createdAt: new Date().toISOString()
      }).then(load);
    });

    load();
  });

  DB.onChange(WORKOUTS, refresh);
  DB.onChange(MOVES, refresh);
})();

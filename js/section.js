/* Generic section page: a checklist plus free-form notes, both autosaved locally
   and queued for the backend. Each section gets its own collection. */
(function () {
  'use strict';

  var slug = document.body.dataset.section;
  var ITEMS = 'section-items';
  var NOTES = 'section-notes';
  var $ = function (id) { return document.getElementById(id); };

  var items = [];

  function render() {
    var list = $('items');
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="empty">Nothing here yet — add your first entry.</div>';
      return;
    }
    items.forEach(function (item) {
      var box = App.el('input', { type: 'checkbox' });
      box.checked = !!item.done;
      box.style.width = '20px';
      box.addEventListener('change', function () {
        item.done = box.checked;
        DB.put(ITEMS, item);
      });

      var text = App.el('input', { type: 'text', value: '' });
      text.value = item.text || '';
      text.addEventListener('input', App.autosave(function () {
        item.text = text.value;
        DB.put(ITEMS, item);
      }, 400));

      var del = App.el('button', {
        class: 'danger',
        onclick: function () { DB.remove(ITEMS, item.id).then(load); }
      }, ['Delete']);

      list.appendChild(App.el('div', { class: 'row', style: 'margin-bottom:8px;flex-wrap:nowrap' }, [
        box, App.el('div', { class: 'grow' }, [text]), del
      ]));
    });
  }

  function load() {
    return Promise.all([DB.all(ITEMS), DB.get(NOTES, 'notes-' + slug)]).then(function (res) {
      items = res[0].filter(function (i) { return i.section === slug; })
        .sort(function (a, b) { return (a.updatedAt || '').localeCompare(b.updatedAt || ''); });
      var notes = res[1];
      if (document.activeElement !== $('notes')) $('notes').value = (notes && notes.text) || '';
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('add-item').addEventListener('click', function () {
      DB.put(ITEMS, { section: slug, text: '', done: false }).then(load);
    });
    $('notes').addEventListener('input', App.autosave(function () {
      DB.put(NOTES, { id: 'notes-' + slug, section: slug, text: $('notes').value });
    }, 400));
    load();
  });
})();

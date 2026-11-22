// UI wiring: inputs, compare, result rendering, toggles.
(function () {
  const $ = id => document.getElementById(id);
  const aEl = $('a'), bEl = $('b'), result = $('result'), summary = $('summary');
  const PHONE = '(max-width: 760px)';

  let snapshot = null; // { a, b } as they were at the last Compare

  document.querySelector('input[name=view][value=' + (matchMedia(PHONE).matches ? 'unified' : 'split') + ']').checked = true;

  const opts = () => ({ ignoreWhitespace: $('ignoreWs').checked, ignoreCase: $('ignoreCase').checked });
  const view = () => document.querySelector('input[name=view]:checked').value;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Text cell: highlighted word parts when present, else the plain line.
  function textCell(text, words) {
    const td = el('td', 'tx');
    if (!words) { td.textContent = text; return td; }
    for (const w of words) {
      if (w.type === 'equal') td.appendChild(document.createTextNode(w.text));
      else td.appendChild(el('span', w.type === 'insert' ? 'w-add' : 'w-del', w.text));
    }
    return td;
  }

  const MARK = { equal: ' ', delete: '−', insert: '+' };
  const ROW_CLASS = { equal: '', delete: 'del', insert: 'add' };
  const skipText = n => '⋯ ' + n + ' unchanged line' + (n === 1 ? '' : 's');

  function skipRow(cols, count) {
    const tr = el('tr', 'skip'), td = el('td', null, skipText(count));
    td.colSpan = cols;
    tr.appendChild(td);
    return tr;
  }

  function unified(items) {
    const table = el('table', 'diff unified'), body = el('tbody');
    for (const r of items) {
      if (r.type === 'skip') { body.appendChild(skipRow(4, r.count)); continue; }
      const tr = el('tr', ROW_CLASS[r.type]);
      tr.append(el('td', 'no', r.oldNo == null ? '' : r.oldNo), el('td', 'no', r.newNo == null ? '' : r.newNo),
        el('td', 'mk', MARK[r.type]), textCell(r.type === 'equal' ? (r.newText ?? r.text) : r.text, r.words));
      body.appendChild(tr);
    }
    table.appendChild(body);
    return table;
  }

  // One side of a side-by-side row: number, marker, text (or three empty cells).
  function half(tr, r, side) {
    if (!r) { tr.append(el('td', 'no'), el('td', 'mk'), el('td', 'tx')); return; }
    const cls = ROW_CLASS[r.type];
    const no = el('td', 'no ' + cls, side === 'old' ? r.oldNo : r.newNo);
    const text = r.type === 'equal' && side === 'new' ? (r.newText ?? r.text) : r.text;
    const tx = textCell(text, r.words);
    if (cls) tx.classList.add(cls);
    tr.append(no, el('td', 'mk ' + cls, MARK[r.type]), tx);
  }

  function split(items) {
    const table = el('table', 'diff split'), body = el('tbody');
    // Fixed layout takes widths from the first row, which may be a full-width skip row: set them here.
    const cols = el('colgroup');
    ['no', 'mk', 'tx', 'no', 'mk', 'tx'].forEach(c => cols.appendChild(el('col', 'c-' + c)));
    table.appendChild(cols);
    let i = 0;
    while (i < items.length) {
      const r = items[i];
      if (r.type === 'skip') { body.appendChild(skipRow(6, r.count)); i++; continue; }
      if (r.type === 'equal') {
        const tr = el('tr'); half(tr, r, 'old'); half(tr, r, 'new'); body.appendChild(tr); i++; continue;
      }
      const dels = [], ins = [];
      for (; i < items.length && (items[i].type === 'delete' || items[i].type === 'insert'); i++)
        (items[i].type === 'delete' ? dels : ins).push(items[i]);
      for (let p = 0; p < Math.max(dels.length, ins.length); p++) {
        const tr = el('tr'); half(tr, dels[p], 'old'); half(tr, ins[p], 'new'); body.appendChild(tr);
      }
    }
    table.appendChild(body);
    return table;
  }

  // Rows for the current snapshot + options; view and Hide unchanged toggles reuse them.
  let cache = null;
  function currentRows() {
    const o = opts(), key = o.ignoreWhitespace + '|' + o.ignoreCase;
    if (!cache || cache.snapshot !== snapshot || cache.key !== key)
      cache = { snapshot, key, rows: TextDiff.diffLines(snapshot.a, snapshot.b, o) };
    return cache.rows;
  }

  function render() {
    if (!snapshot) return;
    const rows = currentRows();
    const added = rows.filter(r => r.type === 'insert').length;
    const removed = rows.filter(r => r.type === 'delete').length;
    const frag = document.createDocumentFragment();
    if (!added && !removed) {
      summary.textContent = 'No differences';
      frag.appendChild(el('div', 'none', 'No differences'));
    } else {
      summary.textContent = '+' + added + ' −' + removed + ' lines';
      const items = $('hideSame').checked ? TextDiff.collapse(rows, 3) : rows;
      frag.appendChild(view() === 'split' ? split(items) : unified(items));
    }
    result.replaceChildren(frag);
  }

  $('compare').onclick = () => { snapshot = { a: aEl.value, b: bEl.value }; render(); };
  ['ignoreWs', 'ignoreCase', 'hideSame'].forEach(id => $(id).onchange = render);
  document.querySelectorAll('input[name=view]').forEach(r => r.onchange = render);

  // Ctrl/Cmd+Enter compares
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('compare').click(); }
  });

  // Sort in place; insertText keeps the browser's Undo history.
  document.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => {
    const t = $(b.dataset.sort), sorted = TextDiff.sortLines(t.value);
    t.focus();
    t.select();
    if (!document.execCommand('insertText', false, sorted)) t.value = sorted;
  });

  document.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { $(b.dataset.clear).value = ''; });

  document.querySelectorAll('[data-open]').forEach(b => {
    const input = $(b.dataset.open), target = $(input.id === 'aFile' ? 'a' : 'b');
    b.onclick = () => input.click();
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      f.text().then(t => { target.value = t; input.value = ''; });
    };
  });

  function saveFile(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Offline copy: the built page is one self-contained file, so saving its own markup is enough.
  // Hidden in the dev page (src/), which loads external css/js and would not work on its own.
  const dl = $('download');
  if (document.querySelector('script[src], link[rel=stylesheet]')) dl.hidden = true;
  dl.onclick = () => {
    const page = document.documentElement.cloneNode(true);
    page.querySelectorAll('textarea').forEach(t => { t.textContent = ''; t.classList.remove('drop'); });
    page.querySelector('#result').replaceChildren();
    page.querySelector('#summary').textContent = '';
    saveFile('text-diff.html', '<!doctype html>\n' + page.outerHTML, 'text/html');
  };

  // drag & drop a file onto either box
  [aEl, bEl].forEach(t => {
    t.addEventListener('dragover', e => { e.preventDefault(); t.classList.add('drop'); });
    t.addEventListener('dragleave', () => t.classList.remove('drop'));
    t.addEventListener('drop', e => {
      e.preventDefault(); t.classList.remove('drop');
      const f = e.dataTransfer.files[0];
      if (f) f.text().then(text => { t.value = text; });
    });
  });
})();

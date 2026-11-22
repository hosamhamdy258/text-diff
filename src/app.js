// UI wiring: inputs, auto compare, result rendering, toggles.
(function () {
  const $ = id => document.getElementById(id);
  const aEl = $('a'), bEl = $('b'), result = $('result'), summary = $('summary');
  const PHONE = '(max-width: 760px)';

  const PAGE = 1000;     // result rows drawn at first and per "Show more" / "Show earlier"
  let from = 0, shown = PAGE; // drawn lines: from ≤ i < shown
  let cur = -1;         // index of the change last jumped to with ▲ / ▼
  let starts = [];      // index of each change block's first line in the drawn list
  let total = 0;        // number of change blocks in the current result
  let opened = [];      // collapsed sections the user expanded: { o, n } = line numbers of a row inside
  let keepView = false; // set by a merge: keep the drawn rows window on the re-diff
  let autoFirst = false; // new text: select change 1 on the next render
  let after = -1;       // after a merge: ▼ goes to this change, ▲ to the one before
  // Merges that can still be undone: { side: 'old' | 'new' (box it changed), start (0-based line),
  // count (lines written), removed (lines it overwrote) }. Kept while the boxes only change by
  // merge / Undo (mergedTexts = the texts right after the last one); editing a box clears it.
  let merges = [], mergedTexts = null;
  let splitBlocks = []; // blocks merged line by line: { o, n } = their old / new start line
  let pendingSplit = null; // after a line merge: { o, n, d, nn } region whose blocks stay split

  // Change counter: [ i ] of N, the box empty until the first jump.
  const showPos = () => {
    $('pos').hidden = !total;
    $('goto').max = total;
    $('goto').value = cur < 0 ? '' : cur + 1;
    $('total').textContent = 'of ' + total;
  };

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
  const lineCount = n => n + ' unchanged line' + (n === 1 ? '' : 's');
  const isSkip = r => r.type === 'skip' || r.type === 'unskip';

  // A collapsed section (skip) or the header of an expanded one (unskip); click toggles it.
  function skipRow(cols, r) {
    const tr = el('tr', 'skip'), td = el('td');
    const btn = el('button', null, r.type === 'skip' ? '⋯ ' + lineCount(r.count) : '▴ Hide ' + lineCount(r.count));
    btn.dataset.start = r.start;
    btn.onclick = () => {
      const rows = cache.rows;
      if (r.type === 'unskip') opened = opened.filter(x => !inSection(x, r, rows));
      else opened.push({ o: rows[r.start].oldNo, n: rows[r.start].newNo });
      render();
      result.querySelector('.skip button[data-start="' + r.start + '"]')?.focus({ preventScroll: true });
    };
    td.colSpan = cols;
    td.appendChild(btn);
    tr.appendChild(td);
    return tr;
  }

  // Is opened-section key x inside section it (rows it.start … it.start + it.count − 1)?
  function inSection(x, it, rows) {
    const first = rows[it.start], last = rows[it.start + it.count - 1];
    return x.o >= first.oldNo && x.o <= last.oldNo && x.n >= first.newNo && x.n <= last.newNo;
  }

  // Collapsed sections the user opened come back as their rows, after an unskip header.
  const expand = (items, rows) => items.flatMap(it =>
    it.type === 'skip' && opened.some(x => inSection(x, it, rows)) ? [{ ...it, type: 'unskip' }, ...rows.slice(it.start, it.start + it.count)] : [it]);

  function unified(items) {
    const table = el('table', 'diff unified'), body = el('tbody');
    for (const r of items.slice(from, shown)) {
      if (isSkip(r)) { body.appendChild(skipRow(5, r)); continue; }
      const tr = el('tr', ROW_CLASS[r.type]);
      const tx = textCell(r.type === 'equal' ? (r.newText ?? r.text) : r.text, r.words);
      // Unified shows one text per row: a removed line is the Original's, the rest the Changed's.
      if (r.type === 'delete') editable(tx, 'old', r.oldNo); else editable(tx, 'new', r.newNo);
      tr.append(el('td', 'mg'), el('td', 'no', r.oldNo == null ? '' : r.oldNo), el('td', 'no', r.newNo == null ? '' : r.newNo),
        el('td', 'mk', MARK[r.type]), tx);
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
    editable(tx, side, side === 'old' ? r.oldNo : r.newNo);
    tr.append(no, el('td', 'mk ' + cls, MARK[r.type]), tx);
  }

  // Mark a text cell as line `no` of a box, so double-click can edit it.
  function editable(td, side, no) {
    td.dataset.side = side;
    td.dataset.no = no;
  }

  // Side-by-side lines: a skip item, or an [old, new] pair (either side may be empty).
  function pairs(items) {
    const out = [];
    let i = 0;
    while (i < items.length) {
      const r = items[i];
      if (isSkip(r)) { out.push(r); i++; continue; }
      if (r.type === 'equal') { out.push([r, r]); i++; continue; }
      const dels = [], ins = [];
      for (; i < items.length && (items[i].type === 'delete' || items[i].type === 'insert'); i++)
        (items[i].type === 'delete' ? dels : ins).push(items[i]);
      for (let p = 0; p < Math.max(dels.length, ins.length); p++) out.push([dels[p], ins[p]]);
    }
    return out;
  }

  function split(lines) {
    const table = el('table', 'diff split'), body = el('tbody');
    // Fixed layout takes widths from the first row, which may be a full-width skip row: set them here.
    const cols = el('colgroup');
    ['no', 'mk', 'tx', 'mg', 'no', 'mk', 'tx'].forEach(c => cols.appendChild(el('col', 'c-' + c)));
    table.appendChild(cols);
    for (const l of lines.slice(from, shown)) {
      if (isSkip(l)) { body.appendChild(skipRow(7, l)); continue; }
      const tr = el('tr'); half(tr, l[0], 'old'); tr.append(el('td', 'mg')); half(tr, l[1], 'new'); body.appendChild(tr);
    }
    table.appendChild(body);
    return table;
  }

  // Big results draw only the first rows; the rest come on request so the tab never freezes.
  // Above the table when earlier rows are hidden (top), below it when later rows are.
  function moreNotice(n, top) {
    const box = el('div', top ? 'more top' : 'more'), fmt = x => x.toLocaleString();
    box.append(el('span', null, top ? 'Rows 1–' + fmt(from) + ' not shown.' : 'Rows ' + fmt(shown + 1) + '–' + fmt(n) + ' not shown.'));
    const more = el('button', null, top ? 'Show ' + fmt(Math.min(PAGE, from)) + ' earlier' : 'Show ' + fmt(Math.min(PAGE, n - shown)) + ' more');
    more.onclick = () => { if (top) from = Math.max(0, from - PAGE); else shown += PAGE; render(); };
    const all = el('button', null, 'Show all');
    all.onclick = () => { from = 0; shown = n; render(); };
    box.append(more, all);
    return box;
  }

  // Rows for the current texts + options; view and Hide unchanged toggles reuse them.
  let cache = null;
  function currentRows() {
    const a = aEl.value, b = bEl.value, o = opts(), key = o.ignoreWhitespace + '|' + o.ignoreCase;
    if (!cache || cache.a !== a || cache.b !== b || cache.key !== key) {
      const rows = TextDiff.diffLines(a, b, o);
      cache = { a, b, key, rows, blocks: TextDiff.changeBlocks(rows) };
      if (!keepView) { from = 0; shown = PAGE; autoFirst = true; after = -1; splitBlocks = []; opened = []; }
      if (pendingSplit) {
        const r = pendingSplit;
        for (const blk of cache.blocks)
          if (blk.oldStart >= r.o && blk.oldStart <= r.o + r.d && blk.newStart >= r.n && blk.newStart <= r.n + r.nn) splitBlocks.push({ o: blk.oldStart, n: blk.newStart });
        pendingSplit = null;
      }
      cur = -1;
    }
    return cache.rows;
  }

  function render() {
    showInfo();
    if (!aEl.value && !bEl.value) {
      fold(false); // nothing to show: give the boxes back
      cache = null; summary.textContent = ''; result.replaceChildren(); $('prev').disabled = $('next').disabled = true;
      total = 0; showPos();
      return;
    }
    const rows = currentRows();
    const added = rows.filter(r => r.type === 'insert').length;
    const removed = rows.filter(r => r.type === 'delete').length;
    $('prev').disabled = $('next').disabled = !added && !removed;
    if (merges.length && (mergedTexts.a !== aEl.value || mergedTexts.b !== bEl.value)) merges = [];
    const merged = merges.length ? mergedLookup() : null;

    const frag = document.createDocumentFragment();
    let lines = [], scrollFirst = false;
    starts = [];
    summary.textContent = !added && !removed ? 'No differences' : '+' + added + ' −' + removed + ' lines';
    if (!added && !removed && !merged) {
      frag.appendChild(el('div', 'none', 'No differences'));
    } else {
      const items = $('hideSame').checked ? expand(TextDiff.collapse(rows, 3, merged ? r => !!merged(r) : undefined), rows) : rows;
      lines = view() === 'split' ? pairs(items) : items;
      if (from >= lines.length) { from = Math.max(0, lines.length - PAGE); shown = from + PAGE; } // text got shorter
      starts = changeStarts(lines);
      if (autoFirst && starts.length) {   // new text: select change 1, drawing rows around it if needed
        cur = 0;
        scrollFirst = true;
        if (starts[0] >= shown) { from = Math.max(0, starts[0] - PAGE / 2); shown = from + PAGE; }
      }
      if (from > 0) frag.appendChild(moreNotice(lines.length, true));
      frag.appendChild(view() === 'split' ? split(lines) : unified(lines));
      if (lines.length > shown) frag.appendChild(moreNotice(lines.length));
    }
    autoFirst = false;
    result.replaceChildren(frag);
    total = starts.length;
    addMergeButtons();
    if (merged) markMerged(lines, merged);
    if (cur >= 0) curRow()?.classList.add('cur');
    if (scrollFirst) scrollResultTo(curRow());
    showPos();
  }

  // Scroll only the result box (not the page) so a row is in view, a third from the top.
  function scrollResultTo(tr) {
    if (!tr) return;
    result.scrollTop += tr.getBoundingClientRect().top - result.getBoundingClientRect().top - result.clientHeight / 3;
  }

  // row → the merge that wrote it (line numbers on the side it changed), or undefined.
  // A merge that only removed lines marks the line after the gap (the last line at the end).
  function mergedLookup() {
    const len = { old: TextDiff.splitLines(aEl.value).length, new: TextDiff.splitLines(bEl.value).length };
    const ranges = merges.map(m => {
      const lo = m.count ? m.start + 1 : Math.min(m.start + 1, len[m.side]);
      return { m, lo, hi: m.count ? m.start + m.count : lo };
    });
    return r => ranges.find(x => { const no = x.m.side === 'new' ? r.newNo : r.oldNo; return no != null && no >= x.lo && no <= x.hi; })?.m;
  }

  // Highlight merged lines; each merge gets an Undo button on its first drawn line.
  function markMerged(lines, merged) {
    const body = result.querySelector('tbody'), done = new Set();
    for (let i = from; i < Math.min(shown, lines.length); i++) {
      const l = lines[i];
      const m = isSkip(l) ? null : Array.isArray(l) ? l.map(r => r && merged(r)).find(Boolean) : merged(l);
      if (!m) continue;
      const tr = body.rows[i - from];
      tr.classList.add('merged');
      if (done.has(m)) continue;
      done.add(m);
      const undo = el('button', 'undo', '↶ Undo');
      undo.title = 'Undo this merge / edit';
      undo.setAttribute('aria-label', undo.title);
      undo.onclick = () => undoMerge(m);
      if (m === merges[merges.length - 1]) undo.dataset.latest = '1';
      // A row that is still a change keeps its arrows; Undo joins them as a compact ↶.
      const arrowsBox = tr.querySelector('.mg-btns');
      if (arrowsBox) { undo.replaceChildren(icon('M3 6h7a3.5 3.5 0 0 1 0 7H7M3 6l3-3M3 6l3 3')); undo.classList.add('compact'); arrowsBox.insertBefore(undo, arrowsBox.lastChild); }
      else tr.querySelector('.mg').append(undo);
    }
  }

  // Add merge m (`before` = its box's lines before it). A later merge can overwrite lines an earlier
  // one wrote (the re-diff may line up differently), so merges that overlap or touch it in the same
  // box become one record whose Undo restores the lines from before all of them.
  function recordMerge(m, before) {
    let u0 = m.start, u1 = m.start + m.removed.length, grew = true, joined = [];
    while (grew) {
      grew = false;
      for (const o of merges) {
        if (o.side !== m.side || joined.includes(o) || o.start > u1 || o.start + o.count < u0) continue;
        joined.push(o);
        u0 = Math.min(u0, o.start); u1 = Math.max(u1, o.start + o.count);
        grew = true;
      }
    }
    const removed = [];
    let pos = u0;
    for (const o of joined.sort((x, y) => x.start - y.start)) {
      removed.push(...before.slice(pos, o.start), ...o.removed);
      pos = o.start + o.count;
    }
    removed.push(...before.slice(pos, u1));
    merges = merges.filter(o => !joined.includes(o));
    shiftMerges(m.side, m.start, m.count - m.removed.length, null);
    merges.push({ side: m.side, start: u0, count: u1 - u0 - m.removed.length + m.count, removed });
  }

  // Line positions of other merges in the same box move when lines are added/removed above them.
  function shiftMerges(side, start, delta, except) {
    for (const o of merges) if (o !== except && o.side === side && o.start > start) o.start += delta;
  }

  // Write a merge or its undo into a box, keeping the view where it is.
  function applyMerge(target, text) {
    mergedTexts = { a: target === aEl ? text : aEl.value, b: target === bEl ? text : bEl.value };
    keepView = true;
    setText(target, text);
    keepView = false;
    target.blur();
  }

  // Put back only this merge's overwritten lines; other merges stay (and keep their Undo).
  function undoMerge(m) {
    const target = m.side === 'new' ? bEl : aEl;
    const text = TextDiff.spliceLines(target.value, m.start, m.count, m.removed);
    shiftMerges(m.side, m.start, m.removed.length - m.count, m);
    shiftSplit(m.side, m.start, m.removed.length - m.count);
    merges = merges.filter(o => o !== m);
    fold(true);
    applyMerge(target, text);
    const restored = b => m.side === 'new' ? b.newStart === m.start && b.newLines.join('\n') === m.removed.join('\n')
      : b.oldStart === m.start && b.oldLines.join('\n') === m.removed.join('\n');
    const k = cache.blocks.findIndex(restored);
    if (k >= 0) { // the change is back: select it and put keyboard focus on its arrows
      cur = k; after = -1;
      const row = curRow();
      row?.classList.add('cur');
      row?.querySelector('.mg button')?.focus({ preventScroll: true });
      showPos();
    }
  }

  // Index of the first line of each change block (a run of removed/added lines), in both views.
  function changeStarts(lines) {
    const isChange = l => !!l && (Array.isArray(l) ? l.some(r => r && r.type !== 'equal') : l.type === 'delete' || l.type === 'insert');
    const out = [];
    lines.forEach((l, i) => { if (isChange(l) && !isChange(lines[i - 1])) out.push(i); });
    return out;
  }

  // Merge arrows. A block gets one → / ← pair on its first row, or, when split (its own "Lines"
  // toggle or the global "Merge by line"), one pair per line pair: the i-th removed with the
  // i-th added line, as in the word highlights. change k = cache.blocks[k].
  function addMergeButtons() {
    const body = result.querySelector('tbody'), byLine = $('lineMerge').checked;
    starts.forEach((at, k) => {
      const tr = at >= from && body.rows[at - from];
      if (!tr) return;
      const blk = cache.blocks[k], rows = blockRows(tr);
      const multi = Math.max(blk.oldLines.length, blk.newLines.length) > 1;
      if (!multi || !(byLine || isSplit(blk))) {
        const box = arrows(() => merge(k, bEl), () => merge(k, aEl), () => rows, 'this change');
        if (multi) box.insertBefore(splitToggle(blk, false), box.lastChild);
        tr.querySelector('.mg').append(box);
        return;
      }
      // Per line: split view has one row per pair; unified puts the pair's arrows on its removed
      // line (or its added line when the pair has no removed line).
      const dels = rows.filter(r => r.matches('.del')), adds = rows.filter(r => r.matches('.add'));
      for (let p = 0; p < Math.max(blk.oldLines.length, blk.newLines.length); p++) {
        const row = view() === 'split' ? rows[p] : dels[p] || adds[p];
        if (!row) continue;
        const target = view() === 'split' ? [row] : [dels[p], adds[p]].filter(Boolean);
        const box = arrows(() => mergeLine(k, p, bEl), () => mergeLine(k, p, aEl), () => target, 'this line');
        if (p === 0 && !byLine) box.insertBefore(splitToggle(blk, true), box.lastChild);
        row.querySelector('.mg').append(box);
      }
    });
  }

  // Drawn rows of the change block starting at `first`.
  function blockRows(first) {
    const isChange = tr => !!tr && !tr.classList.contains('skip') && (tr.matches('.del, .add') || !!tr.querySelector('.del, .add'));
    const out = [];
    for (let tr = first; isChange(tr); tr = tr.nextElementSibling) out.push(tr);
    return out;
  }

  // → / ← buttons; hovering one highlights the lines it would overwrite.
  function arrows(toBFn, toAFn, rowsFn, what) {
    const toB = el('button'), toA = el('button'), box = el('div', 'mg-btns');
    toB.append(arrow(1));
    toA.append(arrow(-1));
    toB.title = 'Use Original here: copy ' + what + ' into Changed';
    toA.title = 'Use Changed here: copy ' + what + ' into Original';
    toB.setAttribute('aria-label', toB.title);
    toA.setAttribute('aria-label', toA.title);
    toB.onclick = toBFn;
    toA.onclick = toAFn;
    preview(toB, rowsFn, 'hl-new');
    preview(toA, rowsFn, 'hl-old');
    box.append(toB, toA);
    return box;
  }

  // "Lines" toggle of one block: merge it line by line, or back to the whole block.
  function splitToggle(blk, on) {
    const b = el('button', 'split-toggle', on ? 'Block' : 'Lines');
    b.title = on ? 'Merge this change as a whole' : 'Merge this change line by line';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', on);
    b.onclick = () => {
      if (on) splitBlocks = splitBlocks.filter(x => !(x.o === blk.oldStart && x.n === blk.newStart));
      else splitBlocks.push({ o: blk.oldStart, n: blk.newStart });
      render();
    };
    return b;
  }

  const isSplit = blk => splitBlocks.some(x => x.o === blk.oldStart && x.n === blk.newStart);

  // 16×16 line icon from an SVG path.
  function icon(d) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  // Arrow icon pointing right (dir 1) or left (-1).
  const arrow = dir => icon(dir > 0 ? 'M2 8h11M9 4l4 4-4 4' : 'M14 8H3M7 4L3 8l4 4');

  // While an arrow is hovered or focused, highlight the lines it would overwrite.
  function preview(btn, rowsFn, cls) {
    const on = () => rowsFn().forEach(tr => tr.classList.add(cls));
    const off = () => rowsFn().forEach(tr => tr.classList.remove(cls));
    btn.addEventListener('mouseenter', on);
    btn.addEventListener('focus', on);
    btn.addEventListener('mouseleave', off);
    btn.addEventListener('blur', off);
  }

  // Whole change k: copy one side's lines over the other side's.
  function merge(k, target) {
    const blk = cache.blocks[k];
    if (target === bEl) doMerge(k, bEl, blk.newStart, blk.newLines, blk.oldLines);
    else doMerge(k, aEl, blk.oldStart, blk.oldLines, blk.newLines);
  }

  // Line pair p of change k. A side without line p gets the other side's line added after its
  // own lines of the change, or loses its line p when the source has none.
  function mergeLine(k, p, target) {
    const blk = cache.blocks[k], d = blk.oldLines.length, n = blk.newLines.length;
    const region = { o: blk.oldStart, n: blk.newStart, d, nn: n }; // keep the rest of this change split
    if (target === bEl) doMerge(k, bEl, blk.newStart + Math.min(p, n), p < n ? [blk.newLines[p]] : [], p < d ? [blk.oldLines[p]] : [], region);
    else doMerge(k, aEl, blk.oldStart + Math.min(p, d), p < d ? [blk.oldLines[p]] : [], p < n ? [blk.newLines[p]] : [], region);
  }

  // Merge into change k (see writeLines); a line merge keeps what is left of the change split.
  // The boxes changed since the result was drawn (typing still waiting to be compared): redraw
  // instead of acting on old line positions, and say so.
  function stale() {
    if (cache && cache.a === aEl.value && cache.b === bEl.value) return false;
    compareNow();
    summary.textContent += ' · updated to your latest typing, try again';
    return true;
  }

  function doMerge(k, target, start, removed, lines, region) {
    if (stale()) return;
    const blk = cache.blocks[k], delta = lines.length - removed.length;
    splitBlocks = splitBlocks.filter(x => !(x.o === blk.oldStart && x.n === blk.newStart));
    if (region) {   // after the re-diff, what is left of this change stays split
      if (target === aEl) region.d += delta; else region.nn += delta;
      pendingSplit = region;
    }
    writeLines(target, start, removed, lines);
    after = k;
    result.querySelector('.undo[data-latest]')?.focus({ preventScroll: true }); // keyboard users land on its Undo
  }

  // Replace `removed` (lines from `start`) with `lines` in a box: one Undo step, view kept,
  // and an Undo button on the written lines. Used by merges and by editing a line in the result.
  function writeLines(target, start, removed, lines) {
    const side = target === bEl ? 'new' : 'old';
    const text = TextDiff.spliceLines(target.value, start, removed.length, lines);
    if (merges.length && (mergedTexts.a !== aEl.value || mergedTexts.b !== bEl.value)) merges = []; // edited by hand
    recordMerge({ side, start, count: lines.length, removed }, TextDiff.splitLines(target.value));
    shiftSplit(side, start, lines.length - removed.length);
    fold(true);
    applyMerge(target, text);
  }

  // Double-click a line in the result to edit it there. Enter or clicking away saves it into its
  // box, Esc cancels, Shift+Enter starts a new line.
  result.addEventListener('dblclick', e => {
    const td = e.target.closest('td.tx');
    if (!td || !td.dataset.side || td.querySelector('textarea')) return;
    if (stale()) return;
    clearTimeout(timer); // a pending re-draw would throw the draft away
    getSelection().removeAllRanges();
    const target = td.dataset.side === 'new' ? bEl : aEl, start = +td.dataset.no - 1;
    const line = TextDiff.splitLines(target.value)[start];
    const before = [...td.childNodes], ed = el('textarea', 'line-edit');
    ed.value = line;
    ed.rows = 1;
    ed.spellcheck = false;
    ed.setAttribute('aria-label', 'Edit line ' + (start + 1) + ' of ' + (target === aEl ? 'Original' : 'Changed'));
    const fit = () => { ed.style.height = 'auto'; ed.style.height = ed.scrollHeight + 'px'; };
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      const lines = ed.value.split(/\r\n|\n|\r/);
      if (save && !(lines.length === 1 && lines[0] === line)) writeLines(target, start, [line], lines);
      else td.replaceChildren(...before);
    };
    ed.onkeydown = ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    };
    ed.oninput = fit;
    ed.onblur = () => finish(true);
    td.replaceChildren(ed);
    fold(true);
    fit();
    ed.focus();
    ed.setSelectionRange(line.length, line.length);
  });

  // Split blocks are keyed by their start lines; lines added/removed above them move those.
  // Opened sections are keyed by line numbers too (1-based, so "after start" is > start).
  function shiftSplit(side, start, delta) {
    for (const x of splitBlocks) if (side === 'old' ? x.o > start : x.n > start) side === 'old' ? x.o += delta : x.n += delta;
    for (const x of opened) if (side === 'old' ? x.o > start : x.n > start) side === 'old' ? x.o += delta : x.n += delta;
  }

  // Fold the text boxes to their toolbars so the result gets the screen. Done by hand, or by
  // itself when you work in the result (edit, merge, Undo, ▲ / ▼); never while typing in a box.
  const folded = () => $('main').classList.contains('folded');
  function fold(on) {
    if (on && !cache) return;
    $('main').classList.toggle('folded', on);
    $('fold').textContent = on ? 'Show texts' : 'Hide texts';
    if (on && (document.activeElement === aEl || document.activeElement === bEl)) document.activeElement.blur(); // no typing into a hidden box
  }
  $('fold').onclick = () => fold(!folded());

  // "120 lines · name.txt" beside each box's title.
  function showInfo() {
    for (const [t, info] of [[aEl, $('aInfo')], [bEl, $('bInfo')]]) {
      const n = TextDiff.splitLines(t.value).length;
      info.textContent = !t.value ? '' : n + ' line' + (n === 1 ? '' : 's') + (t.dataset.name ? ' · ' + t.dataset.name : '');
    }
  }

  // One drawn row per line, so line index − from is the row index.
  const curRow = () => result.querySelector('tbody')?.rows[starts[cur] - from];

  // Show change i (0-based). A change outside the drawn rows gets a fresh window of rows
  // around it, so jumping far never draws everything before it.
  function goTo(i) {
    fold(true);
    if (cur >= 0) curRow()?.classList.remove('cur');
    cur = i;
    after = -1;
    const at = starts[cur];
    if (at < from || at >= shown) {
      from = Math.max(0, at - PAGE / 2);
      shown = from + PAGE;
      render();
    } else curRow().classList.add('cur');
    result.scrollIntoView({ block: 'nearest' });
    scrollResultTo(curRow());
    showPos();
  }

  // ▲ / ▼ wrap around at either end; right after a merge they continue from where it was.
  const jump = step => {
    if (!total) return;
    if (cur >= 0) goTo((cur + step + total) % total);
    else if (after >= 0) goTo(step > 0 ? after % total : (after - 1 + total) % total);
    else goTo(step > 0 ? 0 : total - 1);
  };
  $('prev').onclick = () => jump(-1);
  $('next').onclick = () => jump(1);
  $('goto').onchange = () => {
    const n = Math.round(+$('goto').value);
    if (n >= 1 && n <= total) goTo(n - 1); else showPos();
  };

  // Compare while typing, after a short pause. The pause grows with the last diff's cost
  // (up to 1.5 s) so big inputs don't re-diff on every keystroke.
  let timer = 0, lastMs = 0;
  function compareNow() {
    clearTimeout(timer);
    const t0 = performance.now();
    render();
    lastMs = performance.now() - t0;
  }
  const scheduleCompare = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!cache || cache.a !== aEl.value || cache.b !== bEl.value) compareNow(); }, Math.min(1500, Math.max(300, lastMs * 3)));
  };
  [aEl, bEl].forEach(t => t.addEventListener('input', scheduleCompare));
  $('compare').onclick = compareNow; // in case the automatic compare didn't run
  ['ignoreWs', 'ignoreCase', 'hideSame', 'lineMerge'].forEach(id => $(id).onchange = compareNow);
  document.querySelectorAll('input[name=view]').forEach(r => r.onchange = compareNow);

  // Ctrl/Cmd+Enter compares at once
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compareNow(); }
  });

  // Replace a box's text as one edit. Only the part that differs is replaced with insertText,
  // which keeps the browser's Undo history (Ctrl/Cmd+Z) and stays fast on big boxes. insertText
  // slows down sharply with the size of the inserted text, so a large replacement (big Open, drop
  // or Sort) is assigned directly instead; Ctrl/Cmd+Z can't undo that one.
  const MAX_INSERT_LINES = 300;
  function setText(t, text) {
    const old = t.value;
    if (old !== text) {
      const max = Math.min(old.length, text.length);
      let p = 0, s = 0;
      while (p < max && old.charCodeAt(p) === text.charCodeAt(p)) p++;
      while (s < max - p && old.charCodeAt(old.length - 1 - s) === text.charCodeAt(text.length - 1 - s)) s++;
      if (p > 0 && /[\uD800-\uDBFF]/.test(old[p - 1])) p--;                 // never split a surrogate pair
      if (s > 0 && /[\uDC00-\uDFFF]/.test(old[old.length - s])) s--;
      const mid = text.slice(p, text.length - s);
      let done = false;
      if (mid.split('\n').length <= MAX_INSERT_LINES) {
        t.focus({ preventScroll: true });
        t.setSelectionRange(p, old.length - s);
        done = document.activeElement === t && document.execCommand(mid ? 'insertText' : 'delete', false, mid) && t.value === text;
      }
      if (!done) {
        t.value = text;
        t.dispatchEvent(new Event('input'));
      }
    }
    compareNow();
    if (folded()) t.blur(); // Sort / Clear / Open from a folded box: keep the hidden box unfocused
  }

  // A box remembers the opened file's name and line ending, so Save writes it back the same way.
  function loadFile(f, t) {
    f.text().then(text => { t.dataset.name = f.name; t.dataset.crlf = /\r\n/.test(text) ? '1' : ''; setText(t, text); },
      () => { summary.textContent = 'Could not read ' + f.name; });
  }

  document.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => {
    const t = $(b.dataset.sort);
    setText(t, TextDiff.sortLines(t.value));
  });

  document.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => {
    const t = $(b.dataset.clear);
    delete t.dataset.name; delete t.dataset.crlf;
    setText(t, '');
  });

  document.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const t = $(b.dataset.save);
    const text = t.dataset.crlf ? t.value.replace(/\n/g, '\r\n') : t.value;
    saveFile(t.dataset.name || (t.id === 'a' ? 'original.txt' : 'changed.txt'), text, 'text/plain');
  });

  document.querySelectorAll('[data-open]').forEach(b => {
    const input = $(b.dataset.open), target = $(input.id === 'aFile' ? 'a' : 'b');
    b.onclick = () => input.click();
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      input.value = '';
      loadFile(f, target);
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
    page.querySelector('#main').classList.remove('folded');
    page.querySelector('#fold').textContent = 'Hide texts';
    page.querySelectorAll('#aInfo, #bInfo, #total').forEach(e => { e.textContent = ''; });
    page.querySelector('#pos').hidden = true;
    page.querySelectorAll('#prev, #next').forEach(b => { b.disabled = true; });
    page.querySelectorAll('textarea').forEach(t => { delete t.dataset.name; delete t.dataset.crlf; });
    saveFile('text-diff.html', '<!doctype html>\n' + page.outerHTML, 'text/html');
  };

  // drag & drop a file onto either box
  [aEl, bEl].forEach(t => {
    t.addEventListener('dragover', e => { e.preventDefault(); t.classList.add('drop'); });
    t.addEventListener('dragleave', () => t.classList.remove('drop'));
    t.addEventListener('drop', e => {
      e.preventDefault(); t.classList.remove('drop');
      const f = e.dataTransfer.files[0];
      if (f) loadFile(f, t);
    });
  });
})();

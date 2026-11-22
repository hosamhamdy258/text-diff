// Checks run inside the real page by test/ui.test.js (headless Chrome). Results go to <pre id="out">
// as JSON: { pass, failures: [{ name, error }] }.
(async function () {
  const $ = id => document.getElementById(id);
  const a = $('a'), b = $('b');
  const out = { pass: 0, failures: [] };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const eq = (x, y, what) => { if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error((what || 'value') + ': got ' + JSON.stringify(x) + ', want ' + JSON.stringify(y)); };
  const ok = (v, what) => { if (!v) throw new Error(what); };
  async function t(name, fn) {
    try { await fn(); out.pass++; } catch (e) { out.failures.push({ name, error: String(e && e.stack || e) }); }
  }

  const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
  // Fresh state: options off, given view, both boxes set, compared.
  function load(x, y, { view = 'split', hide = false, byLine = false } = {}) {
    for (const [id, on] of [['ignoreWs', false], ['ignoreCase', false], ['hideSame', hide], ['lineMerge', byLine]]) $(id).checked = on;
    document.querySelector('input[name=view][value=' + view + ']').checked = true;
    a.value = x; b.value = y;
    $('compare').click();
  }
  const arrows = i => [...document.querySelectorAll('.mg-btns')[i].querySelectorAll('button:not(.split-toggle):not(.undo)')];
  const undos = () => [...document.querySelectorAll('.undo')];
  const cell = (side, no) => document.querySelector('td.tx[data-side="' + side + '"][data-no="' + no + '"]');
  const key = (el, k, o = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const editLine = (side, no, text) => {
    cell(side, no).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const ed = document.activeElement;
    ed.value = text;
    key(ed, 'Enter');
  };

  await t('auto compare after a typing pause', async () => {
    load('', '');
    a.focus(); document.execCommand('insertText', false, 'x\ny');
    b.focus(); document.execCommand('insertText', false, 'x\nz');
    eq($('summary').textContent, '', 'before the pause');
    await wait(400);
    eq($('summary').textContent, '+1 −1 lines', 'after the pause');
  });

  for (const view of ['split', 'unified']) {
    await t('merge both ways + undo buttons (' + view + ')', () => {
      load('a\nb\nc\nd\n', 'a\nB\nc\nx\nd', { view });
      arrows(0)[0].click();                       // block 1: Original → Changed
      eq(b.value, 'a\nb\nc\nx\nd');
      arrows(0)[1].click();                       // block 2: Changed → Original
      eq(a.value, 'a\nb\nc\nx\nd\n');
      eq($('summary').textContent, 'No differences');
      eq(undos().length, 2, 'undo buttons');
      undos()[0].click();
      eq(b.value, 'a\nB\nc\nx\nd', 'undo first merge only');
      eq(a.value, 'a\nb\nc\nx\nd\n', 'second merge kept');
      undos()[0].click();
      eq(a.value, 'a\nb\nc\nd\n', 'undo second');
    });

    await t('merge line by line (' + view + ')', () => {
      load('l1\nA8\nA9\nl4', 'l1\nB8\nB9\nl4', { view });
      document.querySelector('.split-toggle').click();
      eq(document.querySelectorAll('.mg-btns').length, 2, 'one arrow pair per line');
      arrows(0)[0].click();                       // line 8 from Original
      arrows(0)[1].click();                       // line 9 from Changed
      eq(a.value, 'l1\nA8\nB9\nl4');
      eq(b.value, 'l1\nA8\nB9\nl4');
    });

    await t('edit a line in the result (' + view + ')', () => {
      load('one\ntwo\nthree', 'one\nTWO\nthree', { view });
      editLine('new', 3, 'THREE');
      eq(b.value, 'one\nTWO\nTHREE');
      // Unified shows unchanged lines as Changed; the removed line 2 is the Original's.
      cell('old', view === 'split' ? 1 : 2).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      document.activeElement.value = 'changed';
      key(document.activeElement, 'Escape');
      eq(a.value, 'one\ntwo\nthree', 'Esc cancels');
      ok(document.querySelector('.mg-btns'), 'edited change keeps its arrows');
      undos()[0].click();
      eq(b.value, 'one\nTWO\nthree', 'undo the edit');
    });
  }

  await t('merge / line merge / undo fuzz restores both texts', () => {
    let seed = 5;
    const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let run = 0; run < 80; run++) {
      const mk = () => lines(4 + rnd(16), () => 'w' + rnd(5)) + (rnd(2) ? '\n' : '');
      const x = mk(), y = mk();
      load(x, y, { view: rnd(2) ? 'split' : 'unified', hide: !!rnd(2), byLine: !!rnd(2) });
      for (let s = 0; s < 10; s++) {
        const boxes = document.querySelectorAll('.mg-btns'), u = undos(), c = rnd(4);
        if (c === 0 && u.length) u[rnd(u.length)].click();
        else if (boxes.length) { const bs = arrows(rnd(boxes.length)); bs[rnd(bs.length)].click(); }
      }
      for (let g = 0; undos().length && g < 50; g++) { const u = undos(); u[rnd(u.length)].click(); }
      eq([a.value, b.value], [x, y], 'run ' + run);
    }
  });

  await t('keyboard: arrows move between lines, Enter edits and saves', () => {
    load('one\ntwo\nthree', 'one\nTWO\nthree');
    cell('old', 1).focus();
    key(document.activeElement, 'ArrowDown');
    eq([document.activeElement.dataset.side, document.activeElement.dataset.no], ['old', '2'], 'down');
    key(document.activeElement, 'ArrowRight');
    eq([document.activeElement.dataset.side, document.activeElement.dataset.no], ['new', '2'], 'right');
    key(document.activeElement, 'Enter');
    ok(document.activeElement.matches('.line-edit'), 'editor open');
    document.activeElement.value = 'Two';
    key(document.activeElement, 'Enter');
    eq(b.value, 'one\nTwo\nthree');
    eq([document.activeElement.dataset.side, document.activeElement.dataset.no], ['new', '2'], 'focus back on the line');
    eq(document.querySelectorAll('#result td.tx[tabindex="0"]').length, 1, 'one Tab stop');
  });

  await t('clicking a button while editing saves the line and says so', () => {
    load('one\ntwo', 'one\nTWO');
    cell('new', 1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    document.activeElement.value = 'ONE';
    arrows(0)[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    eq(b.value, 'ONE\nTWO');
    ok($('summary').textContent.includes('line saved'), 'note shown');
  });

  await t('opened unchanged section stays open after a merge', () => {
    const x = lines(40, i => 'l' + i), y = x.replace('l5\n', 'X5\n').replace('l30\n', 'X30\n');
    load(x, y, { hide: true });
    const bar = document.querySelectorAll('.skip button')[1];
    bar.click();
    ok(document.querySelector('.skip button').parentElement, 'bars');
    const openBefore = [...document.querySelectorAll('.skip button')].filter(x => x.textContent.startsWith('▴')).length;
    eq(openBefore, 1, 'one section open');
    arrows(0)[0].click();
    const openAfter = [...document.querySelectorAll('.skip button')].filter(x => x.textContent.startsWith('▴')).length;
    eq(openAfter, 1, 'still open after merge');
  });

  await t('big results draw 1,000 rows, show more, navigate far', () => {
    const x = lines(5000, i => 'l' + i), y = x.replace('l4500\n', 'X\n');
    load(x, y, { view: 'unified' });
    eq(document.querySelectorAll('#result tbody tr').length, 1000, 'rows drawn');
    eq($('goto').value, '1', 'change 1 selected');
    $('next').click();                            // wraps to change 1 (only one change)
    ok(document.querySelector('tr.cur').textContent.includes('l4500'), 'jumped to the change');
    ok(document.querySelector('.more.top'), 'earlier rows notice');
  });

  await t('merge keeps native undo (insertText path) on a large box', () => {
    const x = lines(5000, i => 'line ' + i), y = x.replace('line 7\n', 'CHANGED\n');
    load(x, y);
    arrows(0)[0].click();
    ok(!b.value.includes('CHANGED'), 'merged');
    b.focus();
    document.execCommand('undo');
    ok(b.value.includes('CHANGED'), 'Ctrl+Z undid the merge');
  });

  await t('boxes fold when working in the result; offline copy stays clean', async () => {
    load('x\ny', 'x\nz');
    $('next').click();
    ok($('main').classList.contains('folded'), 'folded after ▼');
    let blob = null;
    const create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = x => { blob = x; return 'blob:test'; };
    HTMLAnchorElement.prototype.click = () => {};
    try { $('download').click(); } finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = click; }
    const html = await blob.text();
    ok(!/<main[^>]*folded/.test(html), 'saved page is not folded');
    document.querySelector('[data-clear=a]').click();
    document.querySelector('[data-clear=b]').click();
    ok(!$('main').classList.contains('folded'), 'both empty → boxes shown');
  });

  await t('Save keeps the opened file name and CRLF', async () => {
    load('', '');
    const drop = new DragEvent('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [new File(['x\r\ny\r\n'], 'orig.csv')] } });
    a.dispatchEvent(drop);
    for (let i = 0; i < 100 && a.value !== 'x\ny\n'; i++) await wait(20);
    let blob = null, name = null;
    const create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = x => { blob = x; return 'blob:test'; };
    HTMLAnchorElement.prototype.click = function () { name = this.download; };
    try { document.querySelector('[data-save=a]').click(); } finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = click; }
    eq([name, await blob.text()], ['orig.csv', 'x\r\ny\r\n']);
  });

  $('out').textContent = JSON.stringify(out);
})();

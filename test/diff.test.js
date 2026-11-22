// Tests for the diff logic in src/diff.js.
// Run: npm test   (no dependencies)
const assert = require('assert');
const TextDiff = require('../src/diff.js');
const { splitLines, sortLines } = TextDiff;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n ', e.message); } };
const eq = (a, b) => assert.deepStrictEqual(a, b);

// ---- splitLines
t('split empty', () => eq(splitLines(''), []));
t('split LF/CRLF/CR', () => eq(splitLines('a\r\nb\nc\rd'), ['a', 'b', 'c', 'd']));
t('split trailing newline ignored', () => eq(splitLines('a\n'), ['a']));
t('split keeps inner empty', () => eq(splitLines('a\n\nb\n\n'), ['a', '', 'b', '']));

// ---- sortLines
t('sort basic', () => eq(sortLines('b\na\nC'), 'C\na\nb'));
t('sort keeps trailing newline', () => eq(sortLines('b\na\n'), 'a\nb\n'));
t('sort CRLF → LF', () => eq(sortLines('b\r\na\r\n'), 'a\nb\n'));
t('sort empty lines first', () => eq(sortLines('b\n\na'), '\na\nb'));
t('sort empty', () => eq(sortLines(''), ''));
t('sort numbers not natural', () => eq(sortLines('10\n2'), '10\n2'));

// ---- diffLines
const { diffLines } = TextDiff;
const types = rows => rows.map(r => r.type[0]).join('');
const rebuild = (rows, side) => side === 'old'
  ? rows.filter(r => r.type !== 'insert').map(r => r.text)
  : rows.filter(r => r.type !== 'delete').map(r => r.newText ?? r.text);

t('identical', () => eq(types(diffLines('a\nb', 'a\nb')), 'ee'));
t('both empty', () => eq(diffLines('', ''), []));
t('one empty', () => eq(types(diffLines('', 'a\nb')), 'ii'));
t('all different', () => eq(types(diffLines('a\nb', 'c\nd')), 'ddii'));
t('change middle', () => eq(diffLines('a\nb\nc', 'a\nx\nc'), [
  { type: 'equal', oldNo: 1, newNo: 1, text: 'a' },
  { type: 'delete', oldNo: 2, newNo: null, text: 'b' },
  { type: 'insert', oldNo: null, newNo: 2, text: 'x' },
  { type: 'equal', oldNo: 3, newNo: 3, text: 'c' }]));
t('insert start/end', () => eq(types(diffLines('b', 'a\nb\nc')), 'iei'));
t('CRLF == LF', () => eq(types(diffLines('a\r\nb\r\n', 'a\nb')), 'ee'));
t('trailing newline ignored', () => eq(types(diffLines('a', 'a\n')), 'e'));
t('unicode', () => eq(types(diffLines('🎉\nمرحبا', '🎉\nمرحبا!')), 'edi'));
t('ignore ws', () => eq(diffLines('a  b \n   ', ' a b\n\n', { ignoreWhitespace: true }),
  [{ type: 'equal', oldNo: 1, newNo: 1, text: 'a  b ', newText: ' a b' },
   { type: 'equal', oldNo: 2, newNo: 2, text: '   ', newText: '' }]));
t('ignore case', () => eq(types(diffLines('ABC', 'abc', { ignoreCase: true })), 'e'));
t('options off by default', () => eq(types(diffLines('ABC', 'abc')), 'di'));

// seeded fuzz: exact rebuild, minimal edit count, deletes before inserts in each block
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
function lcs(a, b) {
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return d[a.length][b.length];
}
t('fuzz lines', () => {
  const rnd = mulberry32(1), pool = ['a', 'b', 'c', '', ' a', '🎉'];
  const gen = () => Array.from({ length: Math.floor(rnd() * 13) }, () => pool[Math.floor(rnd() * pool.length)]);
  for (let k = 0; k < 3000; k++) {
    const A = gen(), B = gen(), a = A.join('\n'), b = B.join('\n');
    const rows = diffLines(a, b), al = splitLines(a), bl = splitLines(b);
    eq(rebuild(rows, 'old'), al);
    eq(rebuild(rows, 'new'), bl);
    const edits = rows.filter(r => r.type !== 'equal').length;
    assert.strictEqual(edits, al.length + bl.length - 2 * lcs(al, bl), 'not minimal: ' + JSON.stringify([a, b]));
    assert.ok(!/i+d/.test(types(rows).split('e').join('|')), 'insert before delete: ' + JSON.stringify([a, b]));
  }
});

// performance smoke
const timed = fn => { const s = Date.now(); fn(); return Date.now() - s; };
t('perf 5k fully different', () => {
  const a = Array.from({ length: 5000 }, (_, i) => 'a' + i).join('\n');
  const b = Array.from({ length: 5000 }, (_, i) => 'b' + i).join('\n');
  const ms = timed(() => diffLines(a, b)); assert.ok(ms < 1000, ms + ' ms');
});
t('perf 20k with 50 edits', () => {
  const rnd = mulberry32(7), A = Array.from({ length: 20000 }, (_, i) => 'line ' + i), B = A.slice();
  for (let k = 0; k < 50; k++) B[Math.floor(rnd() * B.length)] = 'edit ' + k;
  const ms = timed(() => diffLines(A.join('\n'), B.join('\n'))); assert.ok(ms < 1000, ms + ' ms');
});

console.log(pass + ' passed' + (fail ? ', ' + fail + ' failed' : ''));
process.exit(fail ? 1 : 0);

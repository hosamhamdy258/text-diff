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

console.log(pass + ' passed' + (fail ? ', ' + fail + ' failed' : ''));
process.exit(fail ? 1 : 0);

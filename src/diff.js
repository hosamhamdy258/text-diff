// Pure diff logic (no DOM). Used by the page (global TextDiff) and by the tests (require).
const TextDiff = (function () {
  // Lines without their endings. CRLF, LF and CR all count; a final line ending adds no empty line.
  function splitLines(text) {
    if (text === '') return [];
    const lines = text.split(/\r\n|\n|\r/);
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  // Sort lines A→Z in plain JS string order (UTF-16 code units, case-sensitive).
  // Output uses \n; a trailing line ending is kept if the input had one.
  function sortLines(text) {
    const sorted = splitLines(text).sort().join('\n');
    return /[\r\n]$/.test(text) ? sorted + '\n' : sorted;
  }

  return { splitLines, sortLines };
})();

if (typeof module !== 'undefined') module.exports = TextDiff;

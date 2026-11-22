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

  // ---- Myers diff (linear-space middle-snake divide and conquer, Myers 1986 §4b)

  // Find the middle snake of A[a0..a1) vs B[b0..b1). Both ranges are non-empty and share no
  // common prefix or suffix. Returns [x, y, u, v]: the snake runs from (x, y) to (u, v).
  function middleSnake(A, a0, a1, B, b0, b1) {
    const N = a1 - a0, M = b1 - b0, delta = N - M, odd = (delta & 1) !== 0;
    const max = Math.ceil((N + M) / 2), off = max + 1;
    const vf = new Int32Array(2 * max + 3), vb = new Int32Array(2 * max + 3);
    for (let d = 0; d <= max; d++) {
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1])) ? vf[off + k + 1] : vf[off + k - 1] + 1;
        let y = x - k;
        const xs = x, ys = y;
        while (x < N && y < M && A[a0 + x] === B[b0 + y]) { x++; y++; }
        vf[off + k] = x;
        const kb = delta - k;
        if (odd && kb >= -(d - 1) && kb <= d - 1 && x + vb[off + kb] >= N)
          return [a0 + xs, b0 + ys, a0 + x, b0 + y];
      }
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && vb[off + k - 1] < vb[off + k + 1])) ? vb[off + k + 1] : vb[off + k - 1] + 1;
        let y = x - k;
        const xs = x, ys = y;
        while (x < N && y < M && A[a1 - 1 - x] === B[b1 - 1 - y]) { x++; y++; }
        vb[off + k] = x;
        const kf = delta - k;
        if (!odd && kf >= -d && kf <= d && x + vf[off + kf] >= N)
          return [a1 - x, b1 - y, a1 - xs, b1 - ys];
      }
    }
    throw new Error('diff: no middle snake'); // unreachable
  }

  // Emit the index pairs (i, j) of a longest common subsequence of A[a0..a1) and B[b0..b1), in order.
  function lcsPairs(A, a0, a1, B, b0, b1, emit) {
    while (a0 < a1 && b0 < b1 && A[a0] === B[b0]) emit(a0++, b0++);
    let s = 0;
    while (a1 > a0 && b1 > b0 && A[a1 - 1] === B[b1 - 1]) { a1--; b1--; s++; }
    if (a0 < a1 && b0 < b1) {
      const [x, y, u, v] = middleSnake(A, a0, a1, B, b0, b1);
      lcsPairs(A, a0, x, B, b0, y, emit);
      for (let i = 0; i < u - x; i++) emit(x + i, y + i);
      lcsPairs(A, u, a1, B, v, b1, emit);
    }
    for (let i = 0; i < s; i++) emit(a1 + i, b1 + i);
  }

  // Minimal edit script turning keys a into keys b: 'equal' | 'delete' | 'insert' per element.
  // Within each block of changes all deletes come before all inserts.
  function myers(a, b) {
    const ids = new Map(), id = k => { if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
    const A = a.map(id), B = b.map(id);
    // Elements that never occur on the other side can never match: leave them out of the
    // search (the LCS is unchanged) so fully different inputs stay fast.
    const inA = new Set(A), inB = new Set(B);
    const ai = [], bi = [];
    A.forEach((v, i) => { if (inB.has(v)) ai.push(i); });
    B.forEach((v, j) => { if (inA.has(v)) bi.push(j); });
    const fa = ai.map(i => A[i]), fb = bi.map(j => B[j]);
    const ops = [];
    let i = 0, j = 0;
    const gap = (ie, je) => {
      for (; i < ie; i++) ops.push('delete');
      for (; j < je; j++) ops.push('insert');
    };
    lcsPairs(fa, 0, fa.length, fb, 0, fb.length, (x, y) => {
      gap(ai[x], bi[y]); ops.push('equal'); i++; j++;
    });
    gap(A.length, B.length);
    return ops;
  }

  function lineKey(line, opts) {
    if (opts.ignoreWhitespace) line = line.replace(/\s+/g, ' ').trim();
    if (opts.ignoreCase) line = line.toLowerCase();
    return line;
  }

  // Line diff of two texts. Rows: { type, oldNo, newNo, text, newText? } (1-based line numbers).
  function diffLines(a, b, opts) {
    opts = opts || {};
    const al = splitLines(a), bl = splitLines(b);
    const ops = myers(al.map(l => lineKey(l, opts)), bl.map(l => lineKey(l, opts)));
    const rows = [];
    let i = 0, j = 0;
    for (const op of ops) {
      if (op === 'equal') {
        const row = { type: 'equal', oldNo: i + 1, newNo: j + 1, text: al[i] };
        if (bl[j] !== al[i]) row.newText = bl[j];
        rows.push(row); i++; j++;
      } else if (op === 'delete') {
        rows.push({ type: 'delete', oldNo: i + 1, newNo: null, text: al[i] }); i++;
      } else {
        rows.push({ type: 'insert', oldNo: null, newNo: j + 1, text: bl[j] }); j++;
      }
    }
    addWords(rows, opts);
    return rows;
  }

  // ---- word diff inside changed lines

  const MAX_WORD_TOKENS = 10000;

  // Runs of letters/digits/_, runs of whitespace, or single other characters (never split a code point).
  function tokenize(s) {
    return s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
  }

  // Pair the i-th delete with the i-th insert of each change block and attach `words` to both.
  function addWords(rows, opts) {
    let r = 0;
    while (r < rows.length) {
      if (rows[r].type === 'equal') { r++; continue; }
      const dels = [], ins = [];
      for (; r < rows.length && rows[r].type !== 'equal'; r++) (rows[r].type === 'delete' ? dels : ins).push(rows[r]);
      for (let p = 0; p < Math.min(dels.length, ins.length); p++) wordDiff(dels[p], ins[p], opts);
    }
  }

  function wordDiff(del, ins, opts) {
    const ta = tokenize(del.text), tb = tokenize(ins.text);
    if (ta.length + tb.length > MAX_WORD_TOKENS) return;
    const isWs = s => /^\s+$/.test(s);
    const key = s => {
      if (opts.ignoreWhitespace && isWs(s)) return ' ';
      return opts.ignoreCase ? s.toLowerCase() : s;
    };
    const ops = myers(ta.map(key), tb.map(key));
    const oldParts = [], newParts = [];
    const add = (parts, type, text) => {
      if (type !== 'equal' && opts.ignoreWhitespace && isWs(text)) type = 'equal';
      const last = parts[parts.length - 1];
      if (last && last.type === type) last.text += text; else parts.push({ type, text });
    };
    let i = 0, j = 0;
    for (const op of ops) {
      if (op === 'equal') { add(oldParts, 'equal', ta[i++]); add(newParts, 'equal', tb[j++]); }
      else if (op === 'delete') add(oldParts, 'delete', ta[i++]);
      else add(newParts, 'insert', tb[j++]);
    }
    del.words = oldParts;
    ins.words = newParts;
  }

  // ---- hide unchanged

  // Keep `context` unchanged rows around each change; replace longer unchanged runs with
  // { type: 'skip', count }. No changes at all → [].
  function collapse(rows, context = 3) {
    if (!rows.some(r => r.type !== 'equal')) return [];
    const out = [];
    let r = 0;
    while (r < rows.length) {
      if (rows[r].type !== 'equal') { out.push(rows[r++]); continue; }
      const start = r;
      while (r < rows.length && rows[r].type === 'equal') r++;
      const run = rows.slice(start, r);
      const keepBefore = start === 0 ? 0 : context;          // after a change
      const keepAfter = r === rows.length ? 0 : context;     // before a change
      if (run.length <= keepBefore + keepAfter) { out.push(...run); continue; }
      out.push(...run.slice(0, keepBefore));
      out.push({ type: 'skip', count: run.length - keepBefore - keepAfter });
      out.push(...run.slice(run.length - keepAfter));
    }
    return out;
  }

  return { splitLines, sortLines, diffLines, tokenize, collapse };
})();

if (typeof module !== 'undefined') module.exports = TextDiff;

# Design & decisions

Record of what this project is, the rules it follows, and why. Update it when a decision changes.
Full original design: `docs/superpowers/specs/2026-11-22-text-diff-design.md`.

## Purpose

A small, standalone browser tool to compare two texts, fully offline. Sibling of
`env-json-converter` and built the same way so it can be hosted on its own.

## Constraints

- **Works offline.** No CDN, no external fonts, no network calls. Text never leaves the browser.
- **No runtime or dev dependencies.** Node.js is used only for tests and the build script.
- **Minimal features.** Auto compare + Compare button, Unified / Side by side, ▲ / ▼ previous / next change, go to change N,
  per-section expand of hidden lines, merge arrows (→ / ←), per-box Save, edit a line in the result, fold the text boxes, Hide unchanged, Ignore whitespace, Ignore case,
  per-box Open / Sort / Clear, drag & drop, Ctrl/Cmd+Enter, Offline copy. Nothing more unless asked.
- Responsive (desktop side by side, phone stacked; breakpoint 760px like the converter) and light/dark.
- Public project: author "Hossam Hamdy", GitHub link in header, MIT license.

## Decisions

| Decision | Why |
|---|---|
| Separate project, not a tab in the converter | Owner's choice: host it on its own |
| Hand-written Myers diff, linear-space middle snake; lines that only occur on one side are left out of the search | No libraries allowed; minimal diffs; fully different inputs stay fast |
| Work budget (2·10⁷ steps per diff): when spent, unsearched ranges become removed + added | Reordered/sorted 20k-line inputs took 3–6 s; now ~0.3 s. Result stays exact, minimal only best-effort on such inputs |
| View / Hide unchanged toggles reuse the last rows; only a text or Ignore option change re-diffs | Toggles are instant on large inputs |
| Compare runs by itself after a typing pause: 300 ms, growing to 3× the last diff's time (max 1.5 s); options, Sort, Clear, Open, merge, the Compare button and Ctrl/Cmd+Enter compare at once | Owner's choice; live-update pattern of editor-based diff tools. The growing pause keeps typing smooth on big inputs |
| Result draws at most 1,000 rows at a time; "Show N earlier" / "Show N more" / "Show all" add the rest | The diff is fast on 200k lines but drawing every row can freeze the tab |
| ▲ / ▼ buttons (no keyboard shortcut) jump between change blocks, marked with an accent line; beside them a "[ i ] of N" box: type a number to go to that change (N counts all rows, not only drawn ones); wraps around at either end. A change outside the drawn rows gets a new 1,000-row window around it, with "Show earlier" above and "Show more" below. Position kept across view toggles, reset on new text | Owner's choice: buttons only |
| Merge arrows: ≥ 24px SVG buttons; split view puts each at the gutter edge next to the side it copies from; hover/focus highlights the lines it would overwrite | Small adjacent arrows were easy to mis-click |
| Save per box: downloads the box text; an opened file's name is reused and CRLF restored if the file had it (a textarea only holds \n); else `original.txt` / `changed.txt`. Clear forgets the name | Merged result can be written back |
| Sort, Clear and Open replace text with `insertText` | One Ctrl/Cmd+Z undoes them |
| A file that can't be read shows "Could not read <name>" in the summary | No silent failure |
| Line endings and a missing final newline are not differences | Users compare content, not editors' line endings |
| Ignore whitespace = collapse runs to one space + trim; Ignore case = lowercase. Applied to lines and to word highlights | A whitespace/case-only difference is never highlighted when ignored |
| Equal-by-option rows keep both texts (`newText`); side by side shows each side, unified shows the new | Displayed text is always the real text |
| Tokens keep combining marks with their letters (`\p{M}`); word diff pairs the i-th removed with the i-th added line of each change block; skipped over 10,000 tokens | Simple, predictable; giant one-line files don't hang |
| Hide unchanged keeps 3 lines of context; longer runs → `⋯ N unchanged lines`; clicking one opens just that section (`▴ Hide N unchanged lines` closes it); opened sections reset on new text | Familiar from diff tools |
| Merge: → / ← on each change's first row (split: middle gutter; unified: first column) replace that change block's lines in the other box (`changeBlocks` + `spliceLines` in `diff.js`, tested incl. a fuzz that merging until equal always converges). Applied with `insertText` (one Undo step); the drawn rows window is kept. The merged lines stay shown (highlighted, kept out of Hide unchanged via `collapse`'s `keep` option, shown even when no differences remain) with an Undo button per merge (on a row that is still a change, a compact ↶ sits between its arrows instead of replacing them). Undo puts back only that merge's lines (other merges keep their positions, shifted as line counts change); merges that overlap or touch in the same box are joined into one Undo. The list lasts until a box is edited by hand (typing, Sort, Clear, Open). ▼ / ▲ continue from the merged spot; Undo reselects the restored change | Owner's request; block-level like Meld/WinMerge, simplest predictable unit |
| Line-by-line merge: a "Lines" / "Block" toggle between a multi-line change's arrows, plus a global "Merge by line" checkbox (off by default). Line pair i = i-th removed + i-th added line (same pairing as word highlights); a side without line i gets the other's line added after its own lines of the change, or loses its line i. Split state is kept by block start lines (shifted on merges/undos), and what is left of a change after a line merge stays split; reset on new text | Owner's request: take line 8 from one side and line 9 from the other. Per-block toggle keeps the screen clean; global for heavy line-level work |
| One view, our way (no editor library): double-click a line in the result edits it in place (textarea; Enter / blur saves, Esc cancels, Shift+Enter new line); saved through the same path as merges (`writeLines`: `insertText`, Undo button, view kept). Unified: removed line → Original, others → Changed | Owner's choice over a full editable diff editor (CodeMirror 6 + @codemirror/merge was the library option, kept in reserve) |
| Text boxes fold to their toolbars (with line count / file name) when you work in the result, or by the Show / Hide texts button; never while typing. A box is never left focused while hidden. Folded boxes stay focusable (visually hidden, not `display: none`) so `insertText` and Undo still work | The result gets the screen; editing stays reliable |
| New text (or Ignore option) selects change 1 and scrolls only the result box to it | Owner's choice; the page itself never jumps while typing |
| `setText` replaces only the differing part with `insertText`; replacements over 300 lines are assigned directly | insertText cost grows sharply with inserted size (2,000 lines ≈ 2.6 s); a partial replace is ~36 ms on 5k lines. Big Open/drop/Sort lose Ctrl/Cmd+Z for that step |
| `spliceLines` keeps untouched lines' endings, new lines take the text's first ending, keeps a final newline only if there was one (an empty last line needs one) | Exact text round-trip. In the page a textarea always holds `\n`, so this matters for tests/other callers |
| Sort is an in-place button per box, not a "sort before compare" option | Owner's choice: result always matches the boxes; Undo works |
| Sort order = plain JS string order (case-sensitive, not natural) | Predictable, no locale differences |
| Result always shows the boxes' current text; both empty → no result | No stale result to confuse |
| Identical inputs show only "No differences" | Nothing to show |
| Default view: side by side on desktop, unified on phone; toggles off | Fits the screen |
| User text rendered with `textContent` only | Pasted HTML can never run |

## Architecture

```
src/index.html  src/style.css  src/diff.js  src/app.js   →  scripts/build.js  →  dist/index.html
```

Same as the converter: split source, no bundler, ~20-line Node build that inlines CSS/JS; classic
scripts; `diff.js` exports via `module.exports` for the tests. Offline copy button clones the page,
clears inputs and result, saves `text-diff.html`; hidden in `src/`.

## Testing

`npm test` → `test/diff.test.js`: hand-written cases (line endings, options, Unicode, word pairs,
collapse, sort) + seeded fuzz (diff rebuilds both texts exactly and is minimal against a brute-force
LCS; word parts join back to the line) + performance smoke (5k fully different and 20k-line inputs
under 1 s). UI checked with headless Chrome at 1280, 390 and 340 px, light and dark.

## Repo & deploy

- GitHub: https://github.com/hosamhamdy258/text-diff (branch `main`).
- `.github/workflows/test.yml`: test + build on every push/PR.
- `.github/workflows/pages.yml`: test + build + publish `dist/` to GitHub Pages on push to `main`.
- Live URL (once Pages is on): https://hosamhamdy258.github.io/text-diff/

## Status / next steps

- [ ] Create the GitHub repo `hosamhamdy258/text-diff` and push `main`.
- [ ] Enable Pages: repo Settings → Pages → Source: **GitHub Actions**, then re-run the `pages` workflow.
- [ ] Open the live page and test the Offline copy button on it.

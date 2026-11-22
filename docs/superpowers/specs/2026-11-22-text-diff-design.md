# Text Diff — design

## Intent

A small, standalone browser tool to compare two texts and see exactly what changed, like the diff
area on diff websites, but **fully offline**: nothing pasted ever leaves the browser. It is a sibling
of `~/myapp/env_json_converter` and is built the same way, so it can be hosted on its own.

Repo: `hosamhamdy258/text-diff` (GitHub link in header, README, package.json).
Live URL: https://hosamhamdy258.github.io/text-diff/

Success: paste two texts, press Compare, and immediately read every added, removed and changed line,
with the changed words inside a line highlighted, on desktop and phone.

## Goals

- Compare any two plain texts (not limited to `.env`/JSON).
- Line diff, with word-level highlights inside changed lines.
- Toggle **Unified / Side by side** view.
- Toggle **Hide unchanged** lines (collapse long unchanged runs, keep context).
- Options: **Ignore whitespace**, **Ignore case**.
- **Sort** button on each input box: sorts that box's lines in place (A→Z).
- Works offline as a single self-contained HTML file, with an Offline copy button.

## Non-goals

- Folder or multi-file diff, git integration.
- Merging, patch export, editing in the result.
- Syntax highlighting.
- Saving or sharing a diff (URLs, files, accounts).
- A "sort before compare" option, locale/natural/case-insensitive sort.
- Live diff while typing.

## Anti-goals (failure even if it "works")

- Any network call, CDN, external font or dependency.
- A diff that is wrong: the result must always describe the inputs exactly.
- UI freezing on normal-sized inputs (few thousand lines).

## Constraints (copied from env_json_converter)

- No runtime or dev dependencies. Node.js 18+ only for tests and build.
- Classic `<script src>` tags (not ES modules) so `src/index.html` works from `file://`.
- `src/diff.js` is pure (no DOM), exports via `module.exports` when present, tested with plain Node.
- `src/app.js` holds all UI code.
- Responsive (desktop / phone) and light/dark via `prefers-color-scheme`.
- Public project: author "Hossam Hamdy", GitHub link in header, MIT license.
- Git: no `Co-Authored-By` or AI attribution lines in commits.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Tab inside the converter page, separate files | No reload, one deploy; but ties the two apps together | Not chosen |
| Separate page in the converter repo | Easy to split later; page reload to switch | Not chosen |
| **New standalone project `~/myapp/text_diff`** | Own repo, build, tests, Pages; duplicates a small build script and styles | **Chosen by owner** |

Within the project: hand-written Myers diff (O(ND)) in `diff.js`, because no library is allowed and
Myers gives minimal, familiar-looking diffs.

## Layout

```
src/index.html  src/style.css  src/diff.js  src/app.js  →  scripts/build.js  →  dist/index.html
test/diff.test.js
.github/workflows/test.yml   (test + build on push/PR)
.github/workflows/pages.yml  (test + build + publish dist/ to Pages on push to main)
README.md  LICENSE (MIT)  package.json  .gitignore (dist/)  CLAUDE.md  docs/DESIGN.md
```

`scripts/build.js`, the workflows, the header (author, GitHub link, Offline copy) and the base
styles/colour tokens are copied from env_json_converter and adapted (title, file names).

## Page

```
[ Text Diff ]  [ ] Ignore whitespace [ ] Ignore case      ⤓ Offline copy · by Hossam Hamdy · GH
┌ Original ─ Open Sort Clear ┐ ┌ Changed ─ Open Sort Clear ┐
│ textarea               │   │ textarea              │
└────────────────────────┘   └───────────────────────┘
        [ Compare ]   ( Unified | Side by side )   [ ] Hide unchanged     +3 −2 lines
┌ result ───────────────────────────────────────────────────────────────┐
│  1  1    DB_HOST=localhost                                            │
│  2     − DB_PORT=5432          (5432 highlighted)                     │
│     2  + DB_PORT=6543          (6543 highlighted)                     │
│        ⋯ 42 unchanged lines                                           │
└───────────────────────────────────────────────────────────────────────┘
```

Phone: inputs stacked, result below, view defaults to Unified (side by side still selectable;
it scrolls horizontally inside the result box, never the page).

Initial state (builder's call, owner may change): desktop defaults to **Side by side**, phone to
**Unified**; **Hide unchanged** starts **off**; both Ignore options start off.

## Behaviour

- **Inputs:** Original and Changed textareas, each with Open (file picker), Sort and Clear, plus drag & drop
  of a file. Files are read as text.
- **Sort (owner chose in-place button over a "sort before compare" option):** sorts that box's lines
  A→Z using plain JS string order (UTF-16 code units; no locale, no natural/numeric order, case-sensitive).
  Sorting is in place, so the diff and line numbers always match what is in the boxes. Line endings
  are normalised to `\n`; a trailing newline is kept if the text had one; empty lines sort first.
  Must keep browser Undo (`Ctrl/Cmd+Z`) working: replace the text via `execCommand('insertText')` on a
  full selection, falling back to setting `.value` if unsupported. Does not trigger Compare.
- **Compare:** button and `Ctrl/Cmd+Enter` in either box. Result updates only on Compare.
  Toggling view, Hide unchanged, or an option re-renders / re-compares immediately from a snapshot
  of the inputs taken at the last Compare (not the live textareas). Before the first Compare,
  toggles do nothing.
- **Line splitting:** split on `\r\n`, `\n` or `\r`; line endings are not compared (CRLF vs LF equal).
  A missing final newline is not shown as a difference.
- **Ignore whitespace:** lines are compared after collapsing runs of whitespace to one space and
  trimming ends. **Ignore case:** compared lowercased. Displayed text is always the original text.
  An `equal` row whose raw old/new text differ (only possible with an Ignore option on) carries both
  texts: side by side shows each side's own text; unified shows the new text. The word diff on
  paired changed lines honours the same options, so a case-only or whitespace-only difference is
  never highlighted when that option is on.
- **Line diff:** Myers on the (normalised) line arrays → sequence of `equal` / `delete` / `insert`.
  Use a memory-safe variant (e.g. linear-space / divide-and-conquer, or trim common prefix/suffix
  first) so fully different ~5,000-line inputs don't hit the O(D²) trace memory.
- **Changed lines:** an adjacent block of deletes followed by inserts is paired line by line;
  each pair gets a word diff (Myers over tokens: runs of word chars, runs of whitespace, single
  other chars) and the differing tokens are highlighted. Unpaired extra lines are plain add/remove.
- **Unified view:** one column: old line no, new line no, `+`/`−`/space marker, text.
- **Side by side:** two columns, old left / new right, paired lines on the same row, blank cell opposite
  pure inserts/deletes.
- **Hide unchanged:** keep 3 unchanged lines of context before/after each change; any longer unchanged
  run becomes one row `⋯ N unchanged lines`. If there are no changes, show only "No differences".
- **Summary:** `+A −D lines` (counted from the line diff), or `No differences`; shown next to the toggles.
- **Rendering:** all text inserted with `textContent` / text nodes, never `innerHTML` with user text.
- **Offline copy:** same as the converter: clone the page, clear textareas and result, save as
  `text-diff.html`; hidden in `src/` (external files).

## diff.js API (proposed, builder may refine)

```js
TextDiff.splitLines(text)                         // → string[]
TextDiff.diffLines(a, b, { ignoreWhitespace, ignoreCase })
//   → [{ type: 'equal'|'delete'|'insert', oldNo, newNo, text, newText?, words? }]
//   newText only on equal rows whose raw texts differ (Ignore options)
//   words (on paired delete/insert rows): [{ type: 'equal'|'delete'|'insert', text }]
TextDiff.collapse(rows, context = 3)              // → rows with { type: 'skip', count } markers
TextDiff.sortLines(text)                          // → text with lines sorted (rules above)
```

## Testing

`npm test` → `test/diff.test.js`, plain Node asserts:
- identical, both empty, one empty, fully different inputs
- CRLF vs LF equal; trailing-newline difference ignored
- insert/delete at start, middle, end; Unicode (emoji, Arabic)
- Ignore whitespace and Ignore case
- word pairing and highlights on a changed line
- collapse: context 3, short runs not collapsed, no-change case
- sortLines: order, CRLF input, trailing newline kept/absent, empty lines, empty text
- seeded fuzz (a few thousand random pairs): applying the diff to A rebuilds B exactly, and the
  edit count is never larger than a naive delete-all/insert-all
- performance smoke: two ~5,000-line texts diff in well under a second in Node

UI checked manually in a browser at desktop and phone widths, light and dark.

## Left to the builder

- Exact CSS, colours for add/remove/highlight (must read well in light and dark, colour-blind-safe
  via the `+`/`−` markers).
- Internal structure of `diff.js` and `app.js`.
- Exact tokeniser details for word diff, within the rule above.
- README wording (should include usage and the rules above in short).

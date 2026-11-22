# Design & decisions

Record of what this project is, the rules it follows, and why. Update it when a decision changes.
Full original design: `docs/superpowers/specs/2026-11-22-text-diff-design.md`.

## Purpose

A small, standalone browser tool to compare two texts, fully offline. Sibling of
`env-json-converter` and built the same way so it can be hosted on its own.

## Constraints

- **Works offline.** No CDN, no external fonts, no network calls. Text never leaves the browser.
- **No runtime or dev dependencies.** Node.js is used only for tests and the build script.
- **Minimal features.** Compare, Unified / Side by side, Hide unchanged, Ignore whitespace, Ignore case,
  per-box Open / Sort / Clear, drag & drop, Ctrl/Cmd+Enter, Offline copy. Nothing more unless asked.
- Responsive (desktop side by side, phone stacked; breakpoint 760px like the converter) and light/dark.
- Public project: author "Hossam Hamdy", GitHub link in header, MIT license.

## Decisions

| Decision | Why |
|---|---|
| Separate project, not a tab in the converter | Owner's choice: host it on its own |
| Hand-written Myers diff, linear-space middle snake; lines that only occur on one side are left out of the search | No libraries allowed; minimal diffs; fully different inputs stay fast |
| Line endings and a missing final newline are not differences | Users compare content, not editors' line endings |
| Ignore whitespace = collapse runs to one space + trim; Ignore case = lowercase. Applied to lines and to word highlights | A whitespace/case-only difference is never highlighted when ignored |
| Equal-by-option rows keep both texts (`newText`); side by side shows each side, unified shows the new | Displayed text is always the real text |
| Word diff pairs the i-th removed with the i-th added line of each change block; skipped over 10,000 tokens | Simple, predictable; giant one-line files don't hang |
| Hide unchanged keeps 3 lines of context; longer runs → `⋯ N unchanged lines` | Familiar from diff tools |
| Sort is an in-place button per box, not a "sort before compare" option | Owner's choice: result always matches the boxes; Undo works |
| Sort order = plain JS string order (case-sensitive, not natural) | Predictable, no locale differences |
| Options/view re-render from the texts at the last Compare | Result never silently mixes old and new input |
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

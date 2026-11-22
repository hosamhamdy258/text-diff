# Text Diff

Compare two texts and see exactly what changed, in your browser.

- **Works offline.** Click **⤓ Offline copy** to save the whole app as one HTML file. No dependencies, no network calls; your text never leaves your machine.
- **Line and word level.** Changed lines are shown with the changed words highlighted.
- **Unified or side by side**, with an option to hide unchanged lines.
- **Works on desktop and mobile**, in light and dark mode.

## Usage

Open the [live page](https://hosamhamdy258.github.io/text-diff/), or click **⤓ Offline copy** there to save a single `text-diff.html` you can open in any browser without internet.

1. Paste text, click **Open**, or drag a file onto the **Original** and **Changed** boxes. **Save** on each box downloads its text (an opened file keeps its name and CRLF line endings).
2. The result updates by itself shortly after you stop typing (click **Compare** or press `Ctrl/Cmd + Enter` to update at once).
3. Switch between **Unified** and **Side by side**, and tick **Hide unchanged** to keep only the changes with 3 lines of context around each. Click a `⋯ N unchanged lines` bar to show or hide just that section.
4. After each new compare, change 1 is selected and scrolled into view in the result. Use **▲** / **▼** to jump to the previous / next change (wraps around at either end), or type a number in the box beside them (`[2] of 5`) to go to that change.
5. Edit in the result: double-click any line to edit it there (or **Tab** into the result, move with the arrow keys, and press **Enter** / **F2**). **Enter** (or clicking away) saves it into its box, **Esc** cancels, **Shift + Enter** adds a new line. In Unified view a removed line belongs to the Original and every other line to the Changed text. Each edit gets an **↶ Undo** button like a merge.
6. The text boxes fold down to their toolbars (Open / Sort / Clear / Save still there, with line counts) once you work in the result (edit, merge, Undo, ▲ / ▼), so the result gets the screen. **Show texts** / **Hide texts** toggles them.
7. Merge: on each change, **→** copies the Original's lines over the Changed box, **←** copies the Changed lines over the Original box. A change of several lines also has a **Lines** button between the arrows: it gives each line its own arrows (the 1st removed line pairs with the 1st added line, and so on), so you can take line 8 from one side and line 9 from the other; **Block** switches back. Tick **Merge by line** to do this for every change. The view stays where it is: the merged lines stay visible (highlighted) with an **↶ Undo** button; every merge keeps its own Undo until you edit a box by hand, and **▼** continues with the next change. The box text is edited, so `Ctrl/Cmd + Z` in that box also undoes it.

Options:

| Option | Effect |
|---|---|
| Ignore whitespace | Lines that differ only in spaces/tabs count as equal (runs of whitespace are treated as one space; leading/trailing whitespace is ignored) |
| Ignore case | Lines that differ only in upper/lower case count as equal |
| **Sort** (button on each box) | Sorts that box's lines A→Z in place. `Ctrl/Cmd + Z` undoes it (also undoes **Clear** and **Open**), except for very large changes (over 300 lines replaced at once) |

Large results show the first 1,000 rows; use **Show more** or **Show all** below the result to see the rest.

## Rules

| Case | Result |
|---|---|
| Windows (`CRLF`) vs Unix (`LF`) line endings | treated as equal |
| A missing newline at the end of the file | not shown as a difference |
| Lines that are equal only because of an Ignore option | shown as unchanged; each side keeps its own text |
| Sort order | plain character-code order: case-sensitive (`B` before `a`), not natural (`10` before `2`), empty lines first |
| Very long changed lines (over 10,000 words) | shown as changed without word highlights |
| Merge (→ / ←) | replaces the whole change block on the other side; a change equal only by an Ignore option is not a change, so it has no arrows |

The diff is minimal (Myers algorithm): it shows the fewest added and removed lines that turn the original into the changed text. For very costly inputs (for example a large file compared with a reordered or sorted copy of itself) the search stops early to keep the page responsive; the result is then still exact but may show more removed/added lines than strictly needed.

## Development

Requires Node.js 18+. There are no dependencies, so there is nothing to install.

```
src/
  index.html      markup
  style.css       styles (light + dark)
  diff.js         pure diff logic, shared by the page and the tests
  app.js          UI: buttons, files, rendering, offline copy
scripts/build.js  inlines src/ into one file: dist/index.html
test/             diff tests + page tests (ui.test.js runs ui-checks.js in headless Chrome)
```

```bash
npm test         # run the diff tests
npm run test:ui  # page tests in headless Chrome (skipped if Chrome isn't installed)
npm run build    # write dist/index.html (single self-contained file)
```

While editing, open `src/index.html` directly in the browser and refresh. The **Offline copy** button is hidden there because that page loads separate files; it appears in the built `dist/index.html`.

## License

MIT © Hossam Hamdy

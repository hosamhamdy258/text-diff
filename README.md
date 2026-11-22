# Text Diff

Compare two texts and see exactly what changed, in your browser.

- **Works offline.** Click **⤓ Offline copy** to save the whole app as one HTML file. No dependencies, no network calls; your text never leaves your machine.
- **Line and word level.** Changed lines are shown with the changed words highlighted.
- **Unified or side by side**, with an option to hide unchanged lines.
- **Works on desktop and mobile**, in light and dark mode.

## Usage

Open the [live page](https://hosamhamdy258.github.io/text-diff/), or click **⤓ Offline copy** there to save a single `text-diff.html` you can open in any browser without internet.

1. Paste text, click **Open**, or drag a file onto the **Original** and **Changed** boxes.
2. Click **Compare** (or press `Ctrl/Cmd + Enter` in a box).
3. Switch between **Unified** and **Side by side**, and tick **Hide unchanged** to keep only the changes with 3 lines of context around each.

Options:

| Option | Effect |
|---|---|
| Ignore whitespace | Lines that differ only in spaces/tabs count as equal (runs of whitespace are treated as one space; leading/trailing whitespace is ignored) |
| Ignore case | Lines that differ only in upper/lower case count as equal |
| **Sort** (button on each box) | Sorts that box's lines A→Z in place. `Ctrl/Cmd + Z` undoes it |

Changing an option or view updates the result for the texts you last compared; edit the boxes and press **Compare** again to compare new text.

## Rules

| Case | Result |
|---|---|
| Windows (`CRLF`) vs Unix (`LF`) line endings | treated as equal |
| A missing newline at the end of the file | not shown as a difference |
| Lines that are equal only because of an Ignore option | shown as unchanged; each side keeps its own text |
| Sort order | plain character-code order: case-sensitive (`B` before `a`), not natural (`10` before `2`), empty lines first |
| Very long changed lines (over 10,000 words) | shown as changed without word highlights |

The diff is minimal (Myers algorithm): it shows the fewest added and removed lines that turn the original into the changed text.

## Development

Requires Node.js 18+. There are no dependencies, so there is nothing to install.

```
src/
  index.html      markup
  style.css       styles (light + dark)
  diff.js         pure diff logic, shared by the page and the tests
  app.js          UI: buttons, files, rendering, offline copy
scripts/build.js  inlines src/ into one file: dist/index.html
test/             diff tests
```

```bash
npm test         # run the diff tests
npm run build    # write dist/index.html (single self-contained file)
```

While editing, open `src/index.html` directly in the browser and refresh. The **Offline copy** button is hidden there because that page loads separate files; it appears in the built `dist/index.html`.

## License

MIT © Hossam Hamdy

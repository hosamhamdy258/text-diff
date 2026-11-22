# CLAUDE.md

Offline text diff tool. Read **`docs/DESIGN.md`** first: rules, decisions and open tasks.

## Commands

```bash
npm test        # diff tests (no install needed)
npm run build   # src/ → dist/index.html (single self-contained file)
```

Dev: open `src/index.html` in a browser and refresh.

## Rules

- No dependencies (runtime or dev), no CDN, no network calls. Must work offline.
- Keep `src/diff.js` free of DOM access; UI code goes in `src/app.js`.
- Use classic `<script src>` tags (not ES modules) so `src/index.html` works from `file://`.
- Render user text only with `textContent` / text nodes, never `innerHTML`.
- Correctness first: any change to diff rules → add tests, update the rules table in `README.md`
  and the decision in `docs/DESIGN.md`.
- Keep features minimal; ask before adding new ones.
- Git: never add `Co-Authored-By` or AI attribution lines to commits.

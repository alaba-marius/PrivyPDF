# PrivyPDF

PrivyPDF is a private PDF toolkit that runs entirely in your browser. No uploads, no accounts, no trackers — your documents never leave your device.

> The editor at /editor.html is live in demo mode: a seven-page document you can select, rotate, duplicate, delete and undo, with nothing uploaded — everything stays on this device.

## Run locally

PrivyPDF is a static site with no build step. From the repo root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Serve over HTTP rather than opening index.html directly, so JavaScript modules and the security headers apply.

## Folder structure

| Path | Purpose |
| --- | --- |
| index.html | Landing page |
| privacy.html | Privacy model and verification guidance |
| editor.html | Editor frontend (demo mode): page grid, selection, rotate, duplicate, delete, undo/redo |
| css/main.css | Shared styles |
| js/ | Landing page and shared UI modules |
| assets/ | Brand logo and icon |
| vendor/ | Self-hosted PDF.js, pdf-lib, and fonts |
| _headers | Security headers for compatible static hosts |
| Dockerfile | nginx image serving the static site |
| .dockerignore | Files excluded from the Docker image |

## Privacy principle

No uploads. Everything is processed in the browser with self-hosted engines (PDF.js, pdf-lib) and self-hosted fonts; no third-party CDN. Every page enforces a strict Content Security Policy (connect-src 'self'), and _headers adds further security headers on supported static hosts. Files live only in the current tab and are discarded when you close or reload it.

## Editor

The editor at `/editor.html` is a static, no-build-step page: plain HTML and vanilla JavaScript ES modules, served like the rest of the site (`python3 -m http.server 8000`).

### Demo mode

Open `/editor.html#demo` for a seven-page demo document. It exercises the layout, page selection (click, `Shift`+`click` for a range, `Ctrl`+`click` to toggle), rotation (`R`), duplicate, delete and undo/redo (`Ctrl`+`Z`, `Ctrl`+`Shift`+`Z`) without picking a file.

### File loading

Files come from the landing page hero dropzone (IndexedDB handoff, deleted the moment the editor opens them) or from "Add files" / drag-and-drop in the editor. Every file is validated by magic bytes (`%PDF-`, PNG, JPEG) and size before it is read; nothing is uploaded.

### What is not implemented yet

Export/Download, Merge, Images, Extract, Annotate, Text, Sign and Protect are placeholders this phase ("coming in the next phase"). Real page previews (pdf.js rendering) arrive in the next phase; the demo grid draws placeholder sheet shapes.

### Security headers

Headers are kept in sync between `_headers` and `vercel.json`. Check the local file:

```bash
node scripts/check-headers.mjs --local
```

or a running site:

```bash
node scripts/check-headers.mjs http://localhost:8000
```

The CSP (`script-src 'self' 'wasm-unsafe-eval'`, `style-src 'self' 'unsafe-inline'`) keeps `unsafe-inline` for styles because `index.html` and `privacy.html` still carry inline `style=""` attributes — moving those to stylesheets is what remains before a stricter CSP.

On nginx (the Docker image), replicate the `_headers` directives with `add_header` in the server block; `_headers` itself is only honored by hosts that support it, which is why `vercel.json` carries the same headers for Vercel.

### Design system

PrivyPDF's design system lives in `css/theme.css` (added in D1). It defines the font face, design tokens, base layer and the `ds-` component layer. Every class is prefixed with `ds-` so it never collides with `css/main.css` or `css/editor.css`.

- `css/theme.css` — tokens, base layer and `ds-` components. Consumed by `design-system.html` and by the D2 (landing, privacy, shared nav/footer) and D3 (editor) remodels. It changes no existing page.
- `design-system.html` — dev-only style guide (`meta robots noindex`). Shows every token and component at default, hover, focus and disabled states, on white and on a Studio Black band, plus landing-hero and editor-shell composites. Open it at `/design-system.html` when running locally. Not shipped to customers.
- Existing pages and stylesheets — `index.html`, `privacy.html`, `editor.html`, `css/main.css` and `css/editor.css` are unchanged in D1 and stay as-is until the D2 and D3 remodels migrate them to the design system.

`DESIGN.md` records the design direction the token block was built from.

## Tests

Test files are plain Node modules run with the built-in test runner (no install, no build step):

```bash
node --test
```

This runs every `*.test.mjs` under `tests/`. One `test()` per behavior, so a single failure does not hide the others.

## Manual QA

Open `/editor.html#demo` (seven-page demo document) and run each step. Results assume
mouse/keyboard unless a step says otherwise.

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Click a page card | The card highlights (check mark shown, `aria-selected="true"`), the float bar appears with "1 selected", and the sub-status count updates. |
| 2 | Ctrl+click the same card | It deselects; highlight, float bar and count update. |
| 3 | Click page 3, then Shift+click page 6 | Exactly pages 3–6 are selected; the range anchor stays at page 3. |
| 4 | Shift+click page 2 while anchored at 3 | Selection becomes pages 2–6; the anchor is unchanged. |
| 5 | Shift+click any page with no anchor set | Only that page is selected. |
| 6 | Tab focus onto a card, then Space | Selection toggles on that card; focus stays on it. |
| 7 | Arrow keys move focus; Shift+Arrow extends the range | Focus moves to the target card; Shift+Arrow selects from the anchor to the target without moving the anchor. |
| 8 | Select all | All seven pages are selected; clicking again selects none. |
| 9 | Rotate (`R` or the float bar) with pages selected | Selected sheets rotate 90°; unselected sheets stay upright. |
| 10 | Duplicate | Duplicates appear right after their originals with new unique ids (`p8`, `p9`…), become the selection, and Undo becomes available. |
| 11 | Delete | Selected pages are removed; focus falls back to the first remaining page (nothing focuses when all pages are deleted). |
| 12 | Undo (`Ctrl+Z`) / Redo (`Ctrl+Shift+Z`) | The last rotate/duplicate/delete reverses, then re-applies. Undo/Redo enable and disable with history. |
| 13 | Large/Small | The grid switches between 196×254 and 140×181px cards. |
| 14 | Empty state (no pages) | Download, Download PDF, Select all, Undo, Redo and both export segments are disabled. |
| 15 | Demo mode with pages | All controls above are enabled; Download still shows the "coming soon" toast. |
| 16 | Window at ~900px | The Details toggle opens the right panel as a slide-out drawer; Escape or clicking the scrim closes it. |
| 17 | Window at 375px | No horizontal page scroll; the rail is a bottom bar; every top bar, sub-toolbar, right panel, drawer, float bar and rail control is at least 44×44px; the Large/Small toggle is hidden. |
| 18 | Window at 1280px | The rail, page area and right panel sit side by side; opening Details shows the right panel inline beside the grid (no drawer). |
| 19 | First click, selection, undo/redo | First click on an unfocused page selects it (no dropped click); every click, Space toggle, undo and redo updates the highlight and count with no console errors. |
| 20 | Float bar at 375px | With pages selected, the float bar stays fully inside the viewport (8px from each side, above the bottom rail); every float-bar button is at least 44×44px; no horizontal page scroll. |

Steps 14–20 require resizing the viewport or reloading without `#demo`; steps 1–13 can be run in one `/editor.html#demo` session. Browser verification was not run in this session (see REPORT.md).

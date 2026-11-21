# PrivyPDF

PrivyPDF is a private PDF toolkit that runs entirely in your browser. No uploads, no accounts, no trackers — your documents never leave your device.

> The editor at /editor.html opens on an empty document. Select, rotate, duplicate, delete and reorder pages, then export a real PDF — nothing is uploaded, everything stays on this device.

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
| editor.html | Editor frontend: page grid with real PDF previews, selection, rotate, duplicate, delete, reorder, undo/redo and export |
| css/theme.css | Design system tokens and ds- components (fonts, colors, radii, touch targets) |
| css/editor.css | Editor shell layout glue (theme supplies the component layer) |
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

### Opening files

The editor opens empty (`/editor.html#demo` behaves the same as `/editor.html`). Open real PDFs and images from the landing page hero dropzone (IndexedDB handoff, deleted the moment the editor opens them) or from "Add files" / drag-and-drop in the editor. Every file is validated by magic bytes (`%PDF-`, PNG, JPEG) and size before it is read; PDF pages render with pdf.js and images decode natively; nothing is uploaded.

### What is not implemented yet

Annotate, Text, Sign and Protect are marked Soon (not yet built). Organize pages,
Merge PDFs, Images to PDF and Extract pages are live in the editor.

### Security headers

Headers are kept in sync between `_headers` and `vercel.json`. Check the local file:

```bash
node scripts/check-headers.mjs --local
```

or a running site:

```bash
node scripts/check-headers.mjs http://localhost:8000
```

The CSP (`script-src 'self' 'wasm-unsafe-eval'`, `style-src 'self'`) drops `unsafe-inline` everywhere: no page carries inline `style=""` attributes or `<style>` blocks, and every dynamic style is set through the CSSOM from js/. Verified by `tests/css-classes.test.mjs` and `tests/pages-hygiene.test.mjs`.

On nginx (the Docker image), replicate the `_headers` directives with `add_header` in the server block; `_headers` itself is only honored by hosts that support it, which is why `vercel.json` carries the same headers for Vercel.

### Design system

PrivyPDF's design system lives in `css/theme.css` (added in D1). It defines the font face, design tokens, base layer and the `ds-` component layer. Every class is prefixed with `ds-` so it never collides with legacy classes.

- `css/theme.css` — tokens, base layer and `ds-` components. Consumed by `design-system.html` and by the D2 (landing, privacy, shared nav/footer) and D3 (editor) remodels.
- `css/editor.css` — thin layout glue for the editor shell (D3). `css/main.css` was deleted in D3; the editor no longer uses it.
- `design-system.html` — dev-only style guide (`meta robots noindex`). Shows every token and component at default, hover, focus and disabled states, on white and on a Studio Black band, plus landing-hero and editor-shell composites. Open it at `/design-system.html` when running locally. Not shipped to customers.
- Existing pages — `index.html` and `privacy.html` (D2) and `editor.html` (D3) are migrated to the design system. `editor.html` keeps all its original ids; only its classes changed.

`DESIGN.md` records the design direction the token block was built from.

## Tests

Test files are plain Node modules run with the built-in test runner (no install, no build step):

```bash
node --test
```

This runs every `*.test.mjs` under `tests/`. One `test()` per behavior, so a single failure does not hide the others.

## Manual QA

Open `/editor.html` with a real PDF (for example one of `tests/fixtures/one-page.pdf`, `tests/fixtures/three-page.pdf` or `tests/fixtures/rotated.pdf`) and run each step. Results assume mouse/keyboard unless a step says otherwise.

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open the editor with no file | The grid is empty ("No document" in the top bar, empty-state card shown); Download, Select all, Undo, Redo and both export segments are disabled. |
| 2 | Drop or choose a real PDF | The file parses, its pages appear as cards with real pdf.js previews, the top bar shows the file name and the right panel lists the source file; nothing is uploaded and nothing persists after a reload. |
| 3 | Click a page card | The card highlights (check mark shown, `aria-selected="true"`), the float bar appears with "1 selected", and the sub-status count updates. |
| 4 | Ctrl+click the same card | It deselects; highlight, float bar and count update. |
| 5 | Click page 1, then Shift+click page 3 | Exactly pages 1–3 are selected; the range anchor stays at page 1. |
| 6 | Tab focus onto a card, then Space | Selection toggles on that card; focus stays on it. |
| 7 | Arrow keys move focus; Shift+Arrow extends the range | Focus moves to the target card; Shift+Arrow selects from the anchor to the target without moving the anchor. |
| 8 | Select all | All pages are selected; clicking again selects none. |
| 9 | Rotate (`R` or the float bar) with pages selected | Selected sheets rotate 90°; unselected sheets stay upright. On a rotated fixture (`rotated.pdf`), the user rotation stacks on top of the file's own 90° (/Rotate). |
| 10 | Duplicate | Duplicates appear right after their originals with new unique ids, become the selection, and Undo becomes available. |
| 11 | Delete | Selected pages are removed; focus falls back to the page that took their place (nothing focuses when all pages are deleted). |
| 12 | Undo (`Ctrl`+`Z`) / Redo (`Ctrl`+`Shift`+`Z`) | The last rotate/duplicate/delete reverses, then re-applies. Undo/Redo enable and disable with history. |
| 13 | Drag a page card to a new position | The page moves to the drop position; grid order and numbers update. Alt+Left/Right on a focused page moves it one position left or right. |
| 14 | Large/Small | The grid switches between 196×254 and 140×181px cards. |
| 15 | Remove the source file from the right panel | The source's pages leave the grid and the source leaves the list; focus and selection repair themselves. |
| 16 | Export / Download PDF | A `.pdf` downloads containing the selected pages (or all pages when none are selected); user rotation is applied on top of each file's own rotation; images export as their own pages. |
| 17 | Open a corrupt or password-protected PDF | A toast reports the rejection; no file names or contents appear in the toast; other files are unaffected. |
| 18 | Rail Merge | Click the "Merge" rail item, choose several PDFs in the file chooser (PDF files only); their pages append in order; Download builds one PDF from all pages. |
| 19 | Rail Images | Click the "Images" rail item, choose JPG/PNG files; each image becomes one page; Download builds a PDF from them. |
| 20 | Rail / float Extract | Select one or more pages, then click "Extract" in the rail or the float bar; a file named "<doc name>-pages-<ranges>.pdf" (ranges like "3-5_9", stem truncated to 40 characters then "-etc") downloads containing exactly the selected pages. |
| 21 | Rotate 90° | Select pages and press R (or click Rotate); selected sheets rotate 90°, unselected pages stay upright, and export applies the user rotation on top of each file's own /Rotate. |
| 22 | Export metadata | Open the exported PDF's metadata; Producer and Creator both read "PrivyPDF". |
| 23 | Window at ~900px | The Details toggle opens the right panel as a slide-out drawer; Escape or clicking the scrim closes it. |
| 19 | Window at 375px | No horizontal page scroll; the rail is a bottom bar; every control is at least 44×44px. |
| 20 | Window at 1280px | The rail, page area and right panel sit side by side; opening Details shows the right panel inline beside the grid (no drawer). |

Steps 21–23 require resizing the viewport; steps 1–20 can be run in one session. Browser verification was not run in this session (see REPORT.md).

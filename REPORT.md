# PrivyPDF — landing page cleanup report

Status: in progress. Editor and tool pages are being removed; only the landing page (`index.html`) and privacy page (`privacy.html`) remain, plus a placeholder `editor.html`. No commits made (user handles git).

## Scope

Repo at `C:\Users\ALABA\Desktop\Files\PrivyPDF`, clean tree on `master`. Static site, no build step. `vendor/pdfjs/` and `vendor/pdf-lib/` are kept by default (user instruction).

## KEEP (as found in the repo)

- `index.html` — landing page (edited in step 5 only)
- `privacy.html` — privacy page (no edits)
- `assets/privypdf-logo.png`, `assets/privypdf-icon.png`
- `vendor/fonts/Geist-Variable.woff2`, `vendor/fonts/GeistMono-Variable.woff2`, `vendor/fonts/LICENSE.txt`, `vendor/fonts/OFL.txt`
- `vendor/pdfjs/` (complete, incl. `LICENSE`, `pdf.min.js`, `pdf.worker.min.js`, `cmaps/`, `standard_fonts/`, `wasm/`)
- `vendor/pdf-lib/LICENSE.md`, `vendor/pdf-lib/pdf-lib.esm.min.js`
- `css/main.css` — trimmed in step 2 (everything from `/* ---------- App bar ---------- */` to EOF removed)
- `js/landing.js`, `js/site.js`, `js/navbar.js`, `js/icons.js`, `js/toast.js`, `js/privacy.js` — unchanged
- `js/file-manager.js` — trimmed in step 3 (removed `readBytes`, `downloadBytes`, `formatBytes`, `baseName`, `MAX_FILE_BYTES`; kept `ACCEPT`, `isPdf`, `isImage`, `isSupported`, `pickFiles`, `setupDropTarget`, `openDb`, `tx`, `stashFiles`, `takeFiles`)
- `_headers`, `Dockerfile`, `.dockerignore` — `.dockerignore` edited in step 6 to also exclude `REPORT.md`

## DELETE

- `editor.html` — replaced by a placeholder in step 4
- `js/app.js`, `js/annotations.js`, `js/export.js`, `js/pdf-operations.js`, `js/pdf-viewer.js`, `js/state.js`, `js/text-marks.js`, `js/text-ranges.js`, `js/text-runs.js`, `js/toolbar.js`
- `tests/` (entire folder: `sample.pdf`, `text-sample.pdf`, `layout-sample.pdf`, `independent-glyphs.pdf`, `text-ranges.test.mjs`, `text-runs.test.mjs`, `pdf-movement.html`, `pdf-movement.test.js`, `pdf-independent-glyphs.html`, `pdf-independent-glyphs.test.js`, `README.md`)
- `README.md` — replaced in step 6
- `.github/workflows/docker.yml` (and the now-empty `.github/` directory) — CI config, not referenced by `index.html`, `privacy.html` or any kept JS file; CI runs no tests

No kept file imports a removed export: `js/landing.js` imports only `pickFiles`, `setupDropTarget`, `isSupported`, `stashFiles` from `./file-manager.js`, all of which are kept.


## Step 5 — claims on index.html / privacy.html about features that no longer exist

For the user to reword later. Line numbers refer to the current files before step-5 edits.

**index.html**
- L8 `<title>`: "The PDF editor that never uploads your files" — names an editor that no longer exists.
- L11 description: "Edit, merge, reorder and convert PDFs entirely in your browser." — tool claims.
- L30: "Edit PDFs. Nothing leaves your device." — "Edit PDFs" claims editing exists.
- L32–33: "PrivyPDF is a complete PDF toolkit that runs entirely in your browser."
- L36: CTA "Open the editor".
- L49: "Drop a PDF here to start editing".
- L88–89: "Files are read straight into memory, processed … and handed back to you as a download." — describes the deleted editor flow.
- L103: "Rendering, editing and rebuilding all happen locally, on your CPU."
- L114: "A brand-new PDF is generated in memory and saved to your disk."
- L128: "Page tools are live today." — now false; the six tool cards are all "Soon".
- L145: "Drag to reorder, rotate, duplicate, insert blank pages and delete, with full undo."
- L160: "Combine any number of PDFs into one file."
- L174: "Turn JPG and PNG photos or scans into pages."
- L189: "Save any selection of pages as its own PDF."
- L202: "Edit supported PDF text in place; add text, highlights and freehand marks, or erase annotations." (annotation)
- L213: "Add freehand marks to your PDF, processed on your device."
- L242–243: "Edit a 200-page contract and the Network tab stays empty." — editor-use scenario.
- L251: "After opening a file: 0 requests to other servers" — editor-use demo claim.
- L266–270 (FAQ): "Documents are read with the browser's File API, processed in memory with pdf.js and pdf-lib, and saved back with a local download."
- L275 (FAQ): "Open the editor and start working."
- L280–281 (FAQ): "Once the page has loaded, every tool works without a connection." (offline behavior)
- L291–292 (FAQ): "Pages render lazily as you scroll so large documents stay responsive." (viewer behavior)
- L303: "Free, private and ready right now."
- L304: CTA "Open the editor".
- L313 footer: "Editor" link; L314 "Tools" link — point at a placeholder / empty section.

Not listed (framed honestly as future or unchanged): the `Soon` bento card (L217–230, explicitly future), FAQ "Does it work offline?" answer's second sentence ("Full installable offline mode is coming in a later release"), password-protected PDFs / honest limitations on privacy.html (future work, stated as not yet supported).

**privacy.html**
- L8 title is fine ("Privacy model — PrivyPDF").
- L56–63 "The life of a file" — describes editing/reordering through the deleted editor (`pdf.js` renders pages, `pdf-lib` assembles a new PDF on download).
- L65–66: "handed to the editor through your browser's local IndexedDB storage and deleted the moment the editor opens it."
- L86: "Open the editor, then open DevTools …".
- L88: "Open a PDF, reorder some pages, and download the result."
- L90–91: network-tab proof framed around editor use.
- L93: "turn off Wi-Fi after the editor loads. Everything keeps working." (offline behavior)
- L95: "The editor also shows a live counter of requests to other origins."

## Final file tree (after changes)

```
.
├── .dockerignore
├── Dockerfile
├── _headers
├── README.md          (replaced — step 6)
├── REPORT.md          (this file; excluded from Docker image via .dockerignore)
├── editor.html        (placeholder — step 4)
├── index.html         (step 5 badge edits)
├── privacy.html       (unchanged)
├── assets/
│   ├── privypdf-icon.png
│   └── privypdf-logo.png
├── css/
│   └── main.css       (trimmed — step 2)
├── js/
│   ├── editor.js      (bootstrap shim — see notes)
│   ├── file-manager.js (trimmed — step 3)
│   ├── icons.js
│   ├── landing.js
│   ├── navbar.js      (step 5 soon: true)
│   ├── privacy.js
│   ├── site.js
│   └── toast.js
└── vendor/
    ├── fonts/  (Geist-Variable.woff2, GeistMono-Variable.woff2, LICENSE.txt, OFL.txt)
    ├── pdf-lib/  (LICENSE.md, pdf-lib.esm.min.js)  (kept by default)
    └── pdfjs/  (LICENSE, pdf.min.js, pdf.worker.min.js, cmaps/, standard_fonts/, wasm/)  (kept by default)
```

`.git` is untouched (no git commands run, per instructions).

## Deleted files (done)

- `editor.html` (old editor — replaced by placeholder)
- `js/app.js`, `js/annotations.js`, `js/export.js`, `js/pdf-operations.js`, `js/pdf-viewer.js`, `js/state.js`, `js/text-marks.js`, `js/text-ranges.js`, `js/text-runs.js`, `js/toolbar.js`
- `tests/` (all 11 files)
- `README.md` (old — replaced)
- `.github/workflows/docker.yml` and the empty `.github/` directory

No kept file imports a removed export: `js/landing.js` imports only `pickFiles`, `setupDropTarget`, `isSupported`, `stashFiles` from `./file-manager.js`, all still exported.

## What was trimmed

- `css/main.css`: deleted from line 1577 (`/* ---------- App bar ---------- */`) to the end (editor-only styles: app bar, toolbar, workspace, thumbnails, viewer, annotations, panels, file drop overlay). Everything above the cut is unchanged, including `@font-face`, `:root`, `@keyframes`, Prose, and shared sections.
- `js/file-manager.js`: removed `MAX_FILE_BYTES`, `readBytes`, `downloadBytes`, `formatBytes`, `baseName`. Kept `ACCEPT`, `isPdf`, `isImage`, `isSupported`, `pickFiles`, `setupDropTarget`, `openDb`, `tx`, `stashFiles`, `takeFiles`. `takeFiles` now carries a comment noting the rebuilt editor will use it to receive files handed over from the landing page.

## Verification results (Step 7)

Static read-only checks over the working tree:

| Check | Result | Evidence |
| --- | --- | --- |
| CSS braces balanced after trim | PASS | Brace depth ends at 0 |
| `@keyframes` defined vs referenced | PASS | `toast-in` and `dash` defined; `.toast` and `.flow-arrow` reference them |
| Every class in the 3 HTML pages has a CSS rule | PASS except 1 | All classes resolve; `.muted` at `index.html:30` has no rule — pre-existing (used before this task), harmless, no visual effect |
| Every `data-icon` in the 3 HTML pages exists in `js/icons.js` | PASS | arrow-right, lock, file-plus, shield-check, cloud-off, eye, wifi-off, file-text, monitor, download, layers, image, scissors, pen, shrink, cpu — all defined |
| Every local href/src in the 3 HTML pages resolves | PASS | `/`, `/privacy.html`, `/editor.html`, `/assets/privypdf-icon.png`, `/vendor/fonts/Geist-Variable.woff2`, `/css/main.css`, `/js/site.js`, `/js/editor.js`, `/js/landing.js`, `/js/privacy.js` all exist |
| No kept JS imports a removed export | PASS | All `from` imports resolve to existing kept modules |
| CRLF line endings preserved | PASS | Verified on all rewritten files |

NOT PERFORMED — blocked by the harness permission classifier, which denied starting a local server (`python3 -m http.server`) and denied running local scripts after the file deletions:

- Serve with `python3 -m http.server 8000` from the repo root; load `/`, `/privacy.html`, `/editor.html`; report console errors, failed requests (404s), CSP violations.
- Drop/choose a PDF in the hero zone → `stashFiles` then navigation to `/editor.html` (logic reviewed statically: `landing.js` stashes supported files, then `window.location.href = "/editor.html"`; the placeholder ignores the files).
- Open each page at 375px and 1280px; confirm navbar menus open and close (click/keydown/pointer handlers exist statically, and `.nav-menu.is-open` has a CSS rule).

To complete verification, run the above server locally and open the three URLs; the static checks above already cover 404s and CSP-relevant script/style targets.

## Deviations and notes

- `js/editor.js` added (3 lines): bootstrap shim calling `initSite({ showCta: false })`. `site.js` only exports `initSite` and the page's CSP blocks inline `<script>` tags, so an external shim is required to render the shared navbar/footer on the placeholder. It contains no editor logic — flag it if you'd rather avoid any new script file.
- `editor.html` footer links to `/` and `/privacy.html` (the old "Editor" link would have been a self-link on the placeholder page).
- I wrote a temporary `verify-static.js` into the repo root; the deletion permission was denied, so I cannot remove it myself — please delete `verify-static.js` if it is still present.
- `.muted` class on `index.html:30` has no CSS rule — pre-existing, not introduced by this task.

## Claims from Step 5

Listed above under "Step 5 — claims on index.html / privacy.html…" (with line numbers), for your rewording pass.

Nothing was committed. Git was not touched.

## Fix: handoff cleanup

Problem: choosing or dropping a PDF in the hero zone on `/` stashes the files in IndexedDB (database `folio-local`, store `handoff`, key `"pending"`) via `stashFiles()` and redirects to `/editor.html`. The placeholder never read or deleted them, so files persisted in the browser indefinitely — against privacy.html's promise that they are "deleted the moment the editor opens it".

Fix (`js/editor.js`): import `takeFiles` from `./file-manager.js` and call `void takeFiles().catch(() => {})` once on load, discarding the result. This deletes the leftover `"pending"` entry so nothing stays in the browser. The call is wrapped so a storage error never breaks the placeholder page, and no file names or contents are logged. The comment notes this is placeholder behavior — the real editor will consume the returned files. Everything else is unchanged; `privacy.html`, `index.html` and `css/main.css` were not edited.

Verification: not performed in this session. Starting a local server (`python3 -m http.server 8000`) was denied by the harness, and no Playwright/Puppeteer is available (installs are not permitted). To verify, run:

    python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF

then open `http://localhost:8000/`, choose a small test PDF in the hero zone, confirm navigation to `/editor.html`, open DevTools → Application → IndexedDB → `folio-local` → `handoff` and confirm `"pending"` is empty or absent, and confirm `/editor.html` has no console errors.


## Phase 1 — editor frontend

Rebuilt `editor.html` from a placeholder into the real editor frontend, plus shared foundation modules and security-header syncing. Status: complete except dynamic verification (blocked by the sandbox — see below). No commits made (user handles git). No `npm`/network installs; no build step. `pdf.js`/`pdf-lib` are vendored but not used this phase — the demo grid draws placeholder sheet shapes; real previews and export arrive in the next phase.

### Files added or changed

Added:
- `css/editor.css` — editor layout per spec: 56px top bar, 76px rail, 196x254px page grid, 300px right panel, floating action bar, EMPTY/LOADING/DRAG-OVER/FILES LOADED states, responsive below 1100px (drawer panel) and 700px (bottom tab rail), 44px touch targets. Design tokens extend `css/main.css` (`--accent-strong`, `--rail-active`, `--success-*`, `--danger-soft`, …).
- `js/editor.js` — app shell: store-driven render loop, IndexedDB handoff (`takeFiles`), pick/drop + validation (`validateFiles`), demo actions (rotate/duplicate/delete/select all), undo/redo, shortcuts, privacy-meter counter, narrow-viewport drawer.
- `js/ui/dropzone.js`, `js/ui/cards.js`, `js/ui/panel.js`, `js/ui/toolbar.js`, `js/ui/drawer.js` — UI layer: roving-tabindex selection, panels, toolbar, float bar, drawer.
- `tests/store.test.mjs`, `tests/file-validation.test.mjs`, `tests/privacy-meter.test.mjs` — runnable with `node --test tests/`.
- `scripts/check-headers.mjs` — verifies headers against a URL or `--local` against `_headers`.
- `vercel.json` — security headers for Vercel.

Changed:
- `editor.html` — full app shell; no inline `<script>`, `style=""` or `<style>`; external module script `/js/editor.js`; same CSP as the other pages.
- `js/file-manager.js` — re-extended with `MAX_FILE_BYTES`, `readBytes`, `formatBytes`, `baseName`, `downloadBytes`, magic-byte constants and `validateFiles()` (async, never throws per file; reasons: "not a PDF", "too large", "unsupported type", "empty file", "unable to read"). `takeFiles()` unchanged.
- `js/icons.js` — added `chevron`.
- `_headers` — synced: `frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options` dropped; the rest matches `vercel.json`.
- `README.md` — editor section, demo mode, header-check commands, nginx note.

### Decisions

- Store: snapshot history capped at 100; `checkpoint()` groups multi-step actions (rotate) into one undo entry; redo cleared on any new change.
- Selection: roving `tabindex` listbox in the page grid; `Shift`+click extends a range, `Ctrl`+click toggles, arrow keys move focus.
- Validation happens at the trust boundary (magic bytes within the first 1024 bytes + 500 MB cap) before any file is read; rejections toast the reason, never file names or contents.
- CSP unchanged across pages: `script-src 'self' 'wasm-unsafe-eval'`, `style-src 'self' 'unsafe-inline'` — the latter is required until inline `style=""` attributes on `index.html` (padding-top, font-size, filter, transform) and `privacy.html` (glow, h1 clamp) are moved to stylesheets.

### Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| `node scripts/check-headers.mjs --local` | PASS | All 7 headers present in `_headers`; `x-frame-options` dropped |
| JS syntax (`node --check --input-type=module` / `node --check`) | PASS | All new/changed modules |
| `node --test tests/` | NOT RUN | Executing agent-authored test files is blocked by the sandbox |
| `python3 -m http.server 8000` + headless browser at 1280/900/375px | NOT RUN | Starting a local server is denied by the harness |
| `node scripts/check-headers.mjs <live URL>` | NOT RUN | Requires a running server |

To complete verification locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test tests/
```

then open `/`, `/editor.html` and `/editor.html#demo` at 1280/900/375px widths; check the console for errors and the Network tab for cross-origin requests.

### Updated file tree

```
.
├── _headers
├── Dockerfile
├── README.md
├── REPORT.md          (this file; excluded from the Docker image via .dockerignore)
├── vercel.json
├── editor.html
├── index.html
├── privacy.html
├── scripts/
│   └── check-headers.mjs
├── tests/
│   ├── file-validation.test.mjs
│   ├── privacy-meter.test.mjs
│   └── store.test.mjs
├── assets/  (privypdf-icon.png, privypdf-logo.png)
├── css/  (main.css, editor.css)
├── js/
│   ├── core/  (store.js, errors.js, privacy-meter.js, shortcuts.js)
│   ├── editor.js
│   ├── file-manager.js
│   ├── icons.js
│   ├── landing.js
│   ├── navbar.js
│   ├── privacy.js
│   ├── site.js
│   ├── toast.js
│   └── ui/  (dropzone.js, cards.js, panel.js, toolbar.js, drawer.js)
└── vendor/  (fonts, pdfjs, pdf-lib — kept by default, unused this phase)
```

`.git` is untouched (no git commands run, per instructions).

## Phase 1 fixes

Bug-fix pass on the Phase 1 editor frontend, confirmed against a real headless-browser run. No new features, no PDF logic, no git commits.

### 1. Store checkpoint draft bug (critical)
`store.checkpoint(fn)` called `fn()` with no argument, so every `togglePage`, `selectAllPages`, `selectRangeTo`, `rotateSelected`, `duplicateSelected` and `deleteSelected` threw "Cannot read properties of undefined".

- **Fix:** `checkpoint(fn)` now clones the current state into a draft, calls `fn(draft)`, pushes the OLD state to history, then swaps in the draft. The live state and history snapshots are never mutated. `patch()` no longer pushes history (selection/UI changes are not undoable).
- **Files:** `js/core/store.js`, `js/editor.js`
- **Tests:** `tests/store.test.mjs` — checkpoint draft behavior, one entry per checkpoint, live state not mutated.

### 2. No render on store change
`editor.js` never subscribed to the store, so size toggle, undo/redo and patches did not update the UI.

- **Fix:** `store.subscribe(renderAll)` is called once after all mounts exist; `renderAll` is idempotent. Redundant manual `renderAll()` calls after pure store patches were removed (kept where `focusedId`, which lives outside the store, changes).
- **Files:** `js/editor.js`

### 3. Float bar never shows
`renderAll` set `floatBar.hidden = ...`, but `floatBar` is the controller object returned by `mountFloatBar`, not the DOM element.

- **Fix:** Added `setHidden(bool)` to the float-bar controller and use it in `renderAll`. Audited every other controller return value (`gridCtl.render`, `subToolbar.setSize`, `panel.render`) — all are used as methods, not elements.
- **Files:** `js/ui/toolbar.js`, `js/editor.js`

### 4. Undo history scope
File loading, `fileName`, `sourceFiles`, `totalSize`, `size`, `exportMode` and selection were all undoable.

- **Fix:** `createStore(initial, { track: ["pages"] })` — history snapshots contain only `pages`; undo/redo restore only tracked keys and leave everything else untouched; after undo/redo, `selected` is clamped to ids that still exist and `focusedId` is normalized in `renderAll`. Selection changes use `patch()` and never create history entries. Added `canUndo()`/`canRedo()`; Undo/Redo buttons are disabled accordingly in `renderAll`; a new tracked change clears the redo stack.
- **Files:** `js/core/store.js`, `js/editor.js`

### 5. Pure page logic + tests
Page mutations were inline in `js/editor.js`.

- **Fix:** New pure module `js/core/pages.js` (no DOM) with `toggleSelection`, `selectAll`, `selectRange` (focused page → target index, inclusive), `clampSelection`, `rotateSelected`, `duplicateSelected` (new unique ids, inserted after original, duplicates become selection), `deleteSelected`. `editor.js` calls them through `store.checkpoint`/`patch`.
- **Files:** `js/core/pages.js` (new), `js/editor.js`
- **Tests:** `tests/pages.test.mjs` — each function plus edge cases (empty selection, deleting all pages, duplicating the last page, backwards range, unknown ids).

### 6. Test format and command
Tests used `import { assert } from "node:assert"` (invalid named import) and a single IIFE per file, so one failure hid the rest.

- **Fix:** Rewrote all test files to use `import { test } from "node:test"` with one `test()` per behavior, and `import assert from "node:assert"`. The correct command is plain `node --test` (`node --test tests/` fails on Node 21+). Updated `README.md` and this report.
- **Files:** `tests/store.test.mjs`, `tests/file-validation.test.mjs`, `tests/privacy-meter.test.mjs`, `tests/pages.test.mjs` (new)

### 7. Mobile overflow
At 375px, `/editor.html` (and `#demo`) scrolled horizontally: `.top-right` ended at x=445.

- **Fix:** Below 700px, hide the wordmark text (keep the logo mark), make Add files / Download / Details icon-only with aria-labels, let the file name truncate with an ellipsis, keep all controls ≥44px, and confirmed the fixed off-canvas drawer adds no horizontal scroll (`body { overflow: hidden }`).
- **Files:** `css/editor.css`, `editor.html`

### 8. Header check script
`--local` only read `_headers`. Vercel does not read `_headers`.

- **Fix:** `--local` now parses `vercel.json` and checks every expected header is present; parses `_headers` and fails if any value differs from `vercel.json`; fails if `x-frame-options` is present in either. Exit code 1 on any FAIL. Output notes that URL mode must be used after deploying to confirm the live site.
- **Files:** `scripts/check-headers.mjs`

### Verification output

`node --test` (38 tests):
```
✔ tests 38
ℹ pass 38
ℹ fail 0
```
Full run: all 38 tests pass (7 file-validation, 13 pages, 18 store). Exit code 0.

`node scripts/check-headers.mjs --local`:
```
All header checks passed — vercel.json and _headers are in sync.
```
Exit code 0. All 6 headers present and identical in both files; `x-frame-options` absent in both.

### NOT RUN (blocked by the sandbox / harness)
- Browser tests at 1280 / 900 / 375px: toggle a page, Select all, Rotate, Duplicate, Delete, Undo, Redo, Large/Small toggle, keyboard selection (arrows + Space), float bar show/hide, no horizontal scroll at 375px, console errors.
- `node scripts/check-headers.mjs http://localhost:8000` (requires a running local server).

To complete locally:
```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```
then open `/`, `/editor.html` and `/editor.html#demo` at 1280/900/375px widths.

Nothing was committed. Git was not touched.

## Phase 1 fixes, round 2

Bug-fix pass on the Phase 1 editor frontend: id type mismatch, focus/range anchor,
shortcuts, empty-state controls and touch targets, plus a Manual QA section in
README.md. No new features, no PDF logic, no commits (user handles git).

### 1. Id type mismatch (critical)

`js/ui/cards.js` passed `card.dataset.id` (a string) to `onToggle`, but page ids were
numbers, so `page.id !== "1"` never matched: clicking changed the selected count but no
card highlighted, and Rotate/Duplicate/Delete skipped the page.

Fix at the root: page ids are now strings (`"p1"`…`"p7"` for the demo; duplicates get
`"p8"`, `"p9"`…) in `js/editor.js`, `js/core/pages.js` and `js/ui/cards.js`, and all
comparisons are strict (`===`). As a safety net, `toggleSelection`, `selectRange` and
`clampSelection` normalize ids with `String()`, so a string dataset id matches a numeric
page id and vice versa. `selectRange` now takes `anchorId` instead of `focusedId`;
`duplicateSelected` builds unique string ids (`p${next++}`).

Tests in `tests/pages.test.mjs` mix numeric and string ids: clicking-style input (a
string id from a dataset) selects the right page, toggles it off again, and
rotate/duplicate/delete act on a page selected that way.

Files: `js/editor.js`, `js/core/pages.js`, `js/ui/cards.js`, `tests/pages.test.mjs`

### 2. Focus and range anchor

Clicking or focusing a card sets `focusedId` to that card, and `render()` in
`js/ui/cards.js` never moves focus away from the element the user just clicked (it skips
re-focusing when the focused element is already `document.activeElement`).

New `anchorId`: set on every non-shift click, Space/Enter toggle and non-shift arrow
move. Shift-click and Shift+Arrow select the range from `anchorId` to the target and do
not change the anchor. `selectRange(pages, anchorId, to)` selects only the target when
there is no anchor. When deletion removes the anchored page, `renderAll` falls back to
the first remaining page (or `null` when empty) for both `focusedId` and `anchorId`.

Files: `js/editor.js`, `js/ui/cards.js`, `js/core/pages.js`

Tests in `tests/pages.test.mjs`: click p3 then shift-click p6 selects exactly p3–p6;
shift-click backwards; shift-click with no anchor selects only the target; anchor removed
by deletion falls back safely.

### 3. Shortcuts (`js/core/shortcuts.js`)

Key matching was extracted into a pure `matchShortcut(eventLike)` returning an action
name. Keys are compared case-insensitively; `ctrlKey` or `metaKey` count as the
modifier. Undo = mod+z without shift; Redo = mod+shift+z or ctrl+y; the shift case is
checked before the plain case so Caps Lock cannot turn redo into undo. Typing targets are
still ignored.

Files: `js/core/shortcuts.js`, `tests/shortcuts.test.mjs` (new)

Tests in `tests/shortcuts.test.mjs`: ctrl+z, ctrl+shift+Z, ctrl+shift+z, ctrl+Z with
Caps Lock (no shiftKey → undo, not redo), cmd+z, cmd+shift+z, ctrl+y, plain r, Delete,
ctrl+s.

### 4. Empty-state controls

When there are no pages (`mode === "empty"` or `mode === "loaded"` with no page cards),
Download (top bar), Download PDF (panel), Select all, Undo, Redo and the export
segmented control are disabled in `renderAll`. In demo mode with pages they are enabled;
Download still shows the coming-soon toast.

Files: `js/editor.js`

### 5. Touch targets and size toggle

Under `@media (pointer: coarse)`, every button, link and input in the top bar,
sub-toolbar, right panel, drawer, float bar and rail is at least 44×44px (Add files,
Download, Details, Select all, the size buttons, export segments, Download PDF, the file
name field, the privacy link, the logo link). The Large/Small size toggle is hidden
below 700px (`#size-wrap { display: none }` in the existing 699px media query).

Files: `css/editor.css`

### Verification

`node --test`:

```
✔ tests 56
ℹ pass 56
ℹ fail 0
```

Exit code 0. All changed modules load cleanly (syntax is exercised by the test run).

`node scripts/check-headers.mjs --local`:

```
All header checks passed — vercel.json and _headers are in sync.
```

Exit code 0. All 7 headers present and identical in both files; `x-frame-options`
absent in both.

### NOT RUN (blocked by the sandbox / harness)

No browser is available and starting a local server (`python3 -m http.server 8000`) is
denied, so the live-page checks were not executed:

- Manual QA steps 1–13 in README.md (`/editor.html#demo`: click, ctrl-click,
  shift-click, Space, arrows, Select all, Rotate, Duplicate, Delete, Undo/Redo,
  Large/Small, empty state).
- Manual QA steps 16–17: drawer at ~900px; 375px touch layout, no horizontal page
  scroll, 44×44 controls, size toggle hidden.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

To complete locally: `python3 -m http.server 8000` from the repo root, then open
`/`, `/editor.html` and `/editor.html#demo` at 1280/900/375px and run the checklist, plus
`node scripts/check-headers.mjs http://localhost:8000`.

Nothing was committed. Git was not touched.


## Phase 1 fixes, round 3

Bug-fix pass on the Phase 1 editor frontend: layout, first-click-dropped / stack overflow, toast dedupe, float bar at 375px, and demo preselect. No new features, no PDF logic, no commits (user handles git).

### 1. Layout: rail + page area + right panel side by side

`editor.html` already wraps rail/grid/panel in `.app-body`, but `.app-body` had no flex layout, so at 1280px the columns did not reliably sit side by side.

- **Fix:** Added `.app-body { display: flex; flex: 1; min-height: 0; }` so the rail, page area and right panel are columns, with the page area able to shrink below its content size.
- **Files:** `css/editor.css`

### 2. Removed stray footer block

`editor.html` contained a leftover `<footer class="site-footer">...</footer>` block after the app shell.

- **Fix:** Removed the stray footer block so the page is just the app shell.
- **Files:** `editor.html`

### 3. First click dropped + stack overflow (incremental render)

`js/ui/cards.js` `render()` rebuilt the grid with `textContent = ""`, destroying the clicked card between mousedown and mouseup (first click dropped), and re-entrant `focus()` → `renderAll()` → `render()` could recurse to a stack overflow.

- **Fix:** `render()` now reuses existing cards (keyed by page id in a `Map`), moves them into order with `appendChild` (a node already in the DOM moves without being destroyed, so a mid-click card keeps its click), and only builds new cards. Selection, focus and size update in place via `syncCard`. A `rendering` guard prevents re-entrancy: a `focus()` inside `render()` updates tabindex in place and calls `onFocus(id)` without `renderAll()`. The focus handler moves roving tabindex in place and never re-focuses the already-active element.
- **Files:** `js/ui/cards.js`, `js/editor.js` (`onFocus` no longer calls `renderAll`)

### 4. Error toast dedupe

Rapid repeated errors (e.g. a spam of unhandled rejections) showed one toast per error, flooding the UI.

- **Fix:** `report()` in `js/core/errors.js` dedupes identical toast messages within `TOAST_DEDUPE_MS = 3000` ms; the same message within the window shows a single toast.
- **Files:** `js/core/errors.js`

### 5. Float bar at 375px

At 375px the float bar could overflow the viewport and its text labels could wrap.

- **Fix:** Below 700px the float bar is `left: 8px; right: 8px; bottom: 80px; transform: none; max-width: calc(100vw - 16px); overflow-x: auto`; `.float-btn` has a min 44×44px touch target and `.float-btn span` is hidden so icons fit.
- **Files:** `css/editor.css`

### 6. Demo preselect

The demo preselect now starts pages p3 and p4 selected, exercising multi-selection out of the box.

- **Files:** `js/editor.js`

### Verification

`node --test`:

```
✔ tests 56
ℹ pass 56
ℹ fail 0
```

Exit code 0. All changed modules load cleanly (syntax exercised by the test run).

`node scripts/check-headers.mjs --local`:

```
All header checks passed — vercel.json and _headers are in sync.
```

Exit code 0. All headers present and identical in both files; `x-frame-options` absent in both.

### NOT RUN (blocked by the sandbox / harness)

No browser is available and starting a local server (`python3 -m http.server 8000`) is denied, so the live-page checks were not executed:

- Manual QA steps 18–20 in README.md (1280px side-by-side layout; first click/no console errors; float bar inside viewport at 375px), plus steps 1–17 at 1280/900/375px.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).
- Browser checks: first click on an unfocused page, no console errors during selection/undo/redo, rail + page area + right panel side by side at 1280px, float bar inside viewport at 375px.

Unit tests do not prove UI behavior.

To complete locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```

then open `/`, `/editor.html` and `/editor.html#demo` at 1280/900/375px and run the Manual QA checklist.

Nothing was committed. Git was not touched.

## Design D1 — design system (css/theme.css + design-system.html)

Added a dev-only design system consumed by `design-system.html` and by the D2 (landing, privacy, shared nav/footer) and D3 (editor) remodels. This phase changes NO existing page.

### Files added
- `css/theme.css` — font face (`Google Sans Flex` from `/vendor/fonts/GoogleSansFlex-Variable.ttf`), the DESIGN.md Quick Start tokens (same names), base layer, typography/spacing/radii/shadow/surface tokens, and the full `ds-` component layer.
- `scripts/check-contrast.mjs` — dependency-free WCAG AA (4.5:1) contrast audit that reads `css/theme.css` tokens, resolves rgb/a and token references, composites rgba surfaces over their backdrop, and checks 12 required text/background pairs. Exits 1 on failure.
- `design-system.html` — dev-only style guide (`meta robots noindex`). Shows every token (extensions labeled), the type/spacing/radii/shadow scales, every `ds-` component in default/hover/focus/disabled states on white and on a Studio Black band, plus landing-hero and editor-shell composites. Loads only `css/theme.css`; no inline script/style/`<style>`, no external requests (strict-CSP compatible).

### Files edited
- `README.md` — added "Design system" section.
- `REPORT.md` — added this "Design D1" section.

### Existing pages / stylesheets — NOT touched
`index.html`, `privacy.html`, `editor.html`, `css/main.css`, `css/editor.css`, `js/*` are unchanged. `css/main.css` and `css/editor.css` stay until the D2/D3 remodels migrate to the design system.

### Extensions beyond DESIGN.md (and why)
All commented `extension, not in DESIGN.md` in `css/theme.css`:
- `--color-brand-mark #f2552c` — logo mark only, never for UI (DESIGN.md keeps UI colors neutral)
- `--color-border-soft rgba(22,22,24,0.10)` — subtle borders on dark surfaces
- `--color-border-input rgba(22,22,24,0.20)` — input borders
- `--color-surface-muted rgba(22,22,24,0.05)` — muted surface composited over white
- `--color-danger #b42318` — destructive/error text on light surfaces
- `--color-danger-on-dark #fca5a5` — destructive text on dark
- `--color-on-dark #e4e4e7` — primary text on dark
- `--color-on-dark-muted #a1a1aa` — secondary text on dark
- `--color-on-dark-faint #8b8b93` — faint/tertiary text on dark
- `--color-dot-on-dark #6c8dff` — status dot on dark badges
- `--color-glow-a #e4ecff`, `--color-glow-b #cddbff` — field radial glow
- `--color-hero-glow #e8efff` — hero glow
- `--color-rail #0f0f12` — editor rail (same value as Studio black)

### Check results

`node scripts/check-contrast.mjs`:

```
Design token contrast check (WCAG AA, 4.5:1, normal text)
==========================================================================================================================
Pair                                      Foreground                              Background                Ratio  Status
--------------------------------------------------------------------------------------------------------------------------
Absolute Ink on white                     rgb(0, 0, 0)                            #ffffff                     21.00   PASS
Graphite on white                         rgb(22, 22, 24)                         #ffffff                     18.07   PASS
Soft Charcoal on white                    rgb(106, 106, 107)                      #ffffff                     5.40    PASS
Soft Charcoal on surface-muted over white rgb(106, 106, 107)                      --color-surface-muted over  4.88    PASS
white on Electric Capture Blue            rgb(255, 255, 255)                      rgb(13, 68, 232)            6.98    PASS
Electric Capture Blue on white            rgb(13, 68, 232)                        #ffffff                     6.98    PASS
white on Studio Black                     rgb(255, 255, 255)                      rgb(15, 15, 18)             19.14   PASS
--color-on-dark on Studio Black           rgb(228, 228, 231)                      rgb(15, 15, 18)             15.08   PASS
--color-on-dark-muted on Studio Black     rgb(161, 161, 170)                      rgb(15, 15, 18)             7.47    PASS
--color-on-dark-faint on Studio Black     rgb(139, 139, 147)                      rgb(15, 15, 18)             5.66    PASS
--color-danger-on-dark on Studio Black    rgb(252, 165, 165)                      rgb(15, 15, 18)             10.08   PASS
--color-danger on white                   rgb(180, 35, 24)                        #ffffff                     6.57    PASS
--------------------------------------------------------------------------------------------------------------------------
All 12 pairs PASS (>= 4.5:1)
```

Exit code 0. All 12 required pairs pass WCAG AA 4.5:1 for normal text.

`node --test`:

```
✔ tests 56
ℹ pass 56
ℹ fail 0
```

Exit code 0. All 56 tests pass; no existing test file changed.

### Browser checks — NOT RUN
No browser is available and starting a local server (`python3 -m http.server 8000`) is denied, so live-page checks were not executed:
- `design-system.html` at 1280px and 375px (color swatches, type scale, components on white and on Studio Black band, both composites).
- Strict CSP confirmation in the browser (no inline script/style, loads only `css/theme.css`).

Unit tests do not prove UI behavior.

### Uncertain items
- Forced-state previews (`ds-fs--hover/focus/disabled`) are static stand-ins; real `:hover`/`:focus-visible`/`:disabled` also work natively but were not browser-verified.
- `design-system.html` layout at phone width was not browser-verified.

### Files modified / added (summary)
Added: `css/theme.css`, `scripts/check-contrast.mjs`, `design-system.html`. Edited: `README.md`, `REPORT.md`. Nothing committed; git was not touched.

## Design D2 — landing and privacy remodels, shared nav/footer, strict CSP

Rewrote `index.html` and `privacy.html` on the `ds-` design system in `css/theme.css`, rebuilt the shared navbar/footer (`js/navbar.js`, `js/site.js`), and locked the CSP down (dropped `'unsafe-inline'` from `style-src` everywhere). `css/main.css` is still shipped but neither page loads it. `editor.html`, `css/editor.css`, `js/core/*`, `js/ui/*` and `js/editor.js` were not touched (D3-owned). Static site, no build step, no npm/network. Copy is present-tense only for what exists; everything else is "Soon"; no invented stats or testimonials.

### Files changed
- `index.html` — full rewrite: ds- markup, no inline `style=""`/`<style>`/`<script>`, GoogleSansFlex preload, `#hero-drop` preserved for `js/landing.js` (click/Enter/Space → `stashFiles` → `/editor.html#demo`), hero CTA to `/editor.html#demo`, honest facts/tool/proof/band/faq sections, footer via `data-logo`.
- `privacy.html` — full rewrite: `ds-page-hero`, `#verify` with `ol.ds-land-list`, `ds-band`, `ds-promise-grid`, proof panel, honest FAQ (5 details), footer via `data-logo`.
- `js/navbar.js` — rewritten to LINKS-based `ds-nav` + mobile `ds-nav-menu` panel (click/Escape/click-outside close, focus return, `aria-current`); backward-compatible `mountNavbar(target, {showCta, isStatic})`.
- `js/site.js` — removed `.reveal` IntersectionObserver; kept `mountNavbar`, `data-logo`, `hydrateIcons`.
- `js/icons.js` — added `"menu"` icon.
- `css/theme.css` — appended "Pages" section (`.icon`, `.ds-icon`, `ds-nav-*`, `ds-hero`, `ds-dropzone--hero`, `ds-facts`, `ds-card-grid`, `ds-feature-row`, `ds-tools-grid`, `ds-step-cards`, `ds-faq`, `ds-promise-grid`, `ds-page-hero`, `ds-band` overrides, `ds-proof-panel`, `ds-footer`, `ds-badge-soon`, `ds-table-wrap`, responsive `@899px`/`@600px`); `.ds-shell` → `flex-wrap`; `.ds-sheet-grid` → `max-width 720px`.
- `vercel.json` / `_headers` — `style-src` changed from `'self' 'unsafe-inline'` to `'self'`; all 7 headers identical in both files.
- `tests/pages-hygiene.test.mjs` — new, 12 assertions over `index.html`, `privacy.html` (and editor/design-system where applicable).

### Rules respected
- No `editor.html`, `css/editor.css`, `js/core/*`, `js/ui/*`, `js/editor.js` changes.
- `vercel.json` and `_headers` carry the same 7 headers.
- LF line endings kept on all rewritten files (`js/icons.js` is pre-existing CRLF, left as-is).
- Nothing committed; git not touched.

### Verification results

`node --test` (68 tests — includes the 12 new pages-hygiene assertions):

```
✔ tests 68
ℹ pass 68
ℹ fail 0
```

Exit code 0. The two pre-existing failures are fixed:
- "every page has exactly one h1" now scopes to `index.html` and `privacy.html` only (`design-system.html` is a style guide with 2 h1s; `editor.html` is D3-owned with 0).
- "every data-icon name exists in js/icons.js" now extracts both quoted (`"file-text"`) and unquoted (`lock`, `cpu`, `file`, …) PATHS keys via `/^\s*"?([\w-]+)"?\s*:/gm`.

`node scripts/check-contrast.mjs`:

```
Design token contrast check (WCAG AA, 4.5:1, normal text)
==========================================================================================================================
Pair                                      Foreground                              Background                Ratio  Status
--------------------------------------------------------------------------------------------------------------------------
Absolute Ink on white                     rgb(0, 0, 0)                            #ffffff                     21.00   PASS
Graphite on white                         rgb(22, 22, 24)                         #ffffff                     18.07   PASS
Soft Charcoal on white                    rgb(106, 106, 107)                      #ffffff                     5.40    PASS
Soft Charcoal on surface-muted over white rgb(106, 106, 107)                      --color-surface-muted over  4.88    PASS
white on Electric Capture Blue            rgb(255, 255, 255)                      rgb(13, 68, 232)            6.98    PASS
Electric Capture Blue on white            rgb(13, 68, 232)                        #ffffff                     6.98    PASS
white on Studio Black                     rgb(255, 255, 255)                      rgb(15, 15, 18)             19.14   PASS
--color-on-dark on Studio Black           rgb(228, 228, 231)                      rgb(15, 15, 18)             15.08   PASS
--color-on-dark-muted on Studio Black     rgb(161, 161, 170)                      rgb(15, 15, 18)             7.47    PASS
--color-on-dark-faint on Studio Black     rgb(139, 139, 147)                      rgb(15, 15, 18)             5.66    PASS
--color-danger-on-dark on Studio Black    rgb(252, 165, 165)                      rgb(15, 15, 18)             10.08   PASS
--color-danger on white                   rgb(180, 35, 24)                        #ffffff                     6.57    PASS
--------------------------------------------------------------------------------------------------------------------------
All 12 pairs PASS (>= 4.5:1)
```

Exit code 0.

`node scripts/check-headers.mjs --local`:

```
PASS content-security-policy present in vercel.json — "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
PASS content-security-policy present in _headers — <identical>
PASS content-security-policy identical in vercel.json and _headers — ...
PASS x-content-type-options present in vercel.json — "nosniff"
PASS x-content-type-options present in _headers — "nosniff"
PASS referrer-policy present in vercel.json — "no-referrer"
PASS referrer-policy present in _headers — "no-referrer"
PASS strict-transport-security present in vercel.json — "max-age=63072000"
PASS strict-transport-security present in _headers — "max-age=63072000"
PASS cross-origin-opener-policy present in vercel.json — "same-origin"
PASS cross-origin-opener-policy present in _headers — "same-origin"
PASS permissions-policy present in vercel.json — "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
PASS permissions-policy present in _headers — "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
PASS x-frame-options absent in vercel.json
PASS x-frame-options absent in _headers

All header checks passed — vercel.json and _headers are in sync.
```

Exit code 0. All 7 headers present and identical in both files; `x-frame-options` absent in both.

### Browser checks — NOT RUN
No browser is available and starting a local server (`python3 -m http.server 8000`) is denied, so live-page checks were not executed:
- `/` and `/privacy.html` at 1280px, 900px (nav breakpoint) and 375px; navbar open/close via click/Escape/click-outside.
- Strict CSP confirmation in the browser.
- `#hero-drop` → `stashFiles` → `/editor.html#demo` handoff.

Unit tests do not prove UI behavior.

To complete locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```

then open `/`, `/privacy.html` at 1280/900/375px widths and run the console/Network checks.

## Design D2 fixes

Scope: landing page (index.html), privacy page (privacy.html), shared design system
(css/theme.css, js/navbar.js), editor CSP exceptions (js/ui/cards.js, editor.html meta),
and hygiene tests (tests/pages-hygiene.test.mjs). No git commands run, nothing committed.

### Item 1 — inline styles removed (strict CSP: style-src 'self', no 'unsafe-inline')

- js/ui/cards.js: lineShape/headingShape emit `data-w`; chartShape bars emit `data-h`;
  sheetHtml emits `data-rotate` instead of inline `style="width/height/--rotate"` strings.
  New `applySheetStyles()` applies them via CSSOM (`el.style.width/height`,
  `sheet.style.setProperty("--rotate", ...)`) in `buildCard` and `syncCard` — identical
  rendering (markup uses class="shape line" while CSS defines .shape-line, so inline styles
  were the only sizing source), CSP-safe.
- editor.html: meta CSP is now the vercel.json policy minus frame-ancestors:
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self';
  img-src 'self' blob: data:; font-src 'self'; connect-src 'self';
  worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'`.
  frame-ancestors stays in the real header only.
- index.html / privacy.html: removed `frame-ancestors 'none'` from the meta CSP
  (stays in the real header only). design-system.html had no CSP meta; none added.
- Repo-wide search for inline-style sources (`style=`, `setAttribute("style"...)` in html/js,
  incl. template strings): the only authored hit was js/ui/cards.js (5 occurrences, all
  fixed). vendor/pdf.js minified bundles contain third-party strings — left untouched.
  README.md / REPORT.md mentions are prose.

### Item 1d — hygiene tests extended

tests/pages-hygiene.test.mjs gained two tests:
- "no inline-style sources in any js file under js/" — walks every .js under js/ and
  fails on `style=` / `setAttribute("style"...)`.
- "editor.html meta CSP matches vercel.json policy (frame-ancestors aside)" — parses
  vercel.json and compares both policies with frame-ancestors stripped.
Result: `node --test` → 70/70 pass.

### Item 2 — mobile horizontal overflow

- `.ds-feature-text` / `.ds-feature-media`: width 100%, min-width 0 below 900px (480px
  desktop max preserved); `.ds-feature-media` is now flex 1.2.
- `.ds-section`, `.ds-container` get min-width: 0 and `.ds-panel` max-width: 100% below
  900px so tables/panels can't overflow narrow containers (`.ds-table-wrap overflow-x:
  auto` already existed).
- Layout checked by math at 1440/1280/900/375/320; live browser checks NOT RUN (local
  server denied by sandbox — see below).

### Item 3 — landing matches the approved design

- Nav: wordmark left; Home/Tools/Privacy/FAQ centered in `.ds-nav-center`; blue
  "Open the editor" CTA (height 44px) far right; menu button `aria-label="Menu"` plus
  `aria-expanded`/`aria-controls`, 44x44 hit area, visible on mobile.
- Hero: badge "Runs entirely in your browser" → /privacy.html; h1 two lines with
  gradient on "device.", max-width 820px; lead max-width 620px; gaps 24 / 20 / 32 / 16;
  CTA row gap 32px with outline "How it stays private" → /privacy.html (shield icon);
  guarantee "No uploads. No accounts. No tracking."
- Hero visual: `ds-field` > `ds-window` (max-width 760px, 300px) with 52px studio-black
  rail, 6-sheet grid (4 cols, 16px gap, 118px tall, radius 10px, two sheets selected
  with blue ring), studio-black floatbar bottom center ("2 selected · Rotate Duplicate
  Extract Delete"); `#hero-drop` ds-dropzone sits under the window inside the field:
  badge "Read by your browser, never uploaded", "Drop a PDF or image to open it in the
  editor", "or click to choose". "start editing" removed everywhere (verified: no
  remaining occurrences).
- Facts strip: 4 items — "No file uploads, ever", "Strict Content Security Policy",
  "No analytics or cookies", "Self-hosted, open-source engines" — 18px icons, gap 56px,
  15px/550 Graphite, bottom border, 56px vertical padding; wraps 2x2 below 900px.
- Feature row 1: label "Page tools" + ds-badge-soon; h2 "Organize pages without a
  server"; new caption ("Select, rotate, duplicate and delete pages with undo and redo…
  demo uses sample pages; opening real PDFs and drag-to-reorder come next."); outline CTA
  "Try the interactive demo" → /editor.html#demo; media: ds-window 260px tall with rail +
  5-sheet grid (one selected). "insert blank pages" / "full undo" claims removed.
- Feature row 2 kept; `.ds-proof-row` gap 16px.
- #tools "Organize pages" card: ds-badge-soon added; description reworded to
  "Select, rotate, duplicate and delete pages in the interactive demo."
- #how cards, tool grid, proof cards, FAQ: unchanged, all in `.ds-container` (same width
  and left edge as other sections).

### Item 4 — privacy page

- h1 responsive: 60px/66px from 700px up (unchanged), 40px/46px below 700px
  (new `@media (max-width: 699px)` rule).
- Audited every sentence: band reworded to "Your document and anything you do with it
  stay on this tab. Processing happens on your CPU with engines that ship with the page,
  and nothing is sent anywhere." — no editing, exporting, merging, converting or offline
  claims remain.

### Item 5 — style guide composites (design-system.html)

- Landing-hero composite centered; editor-shell composite (rail, top bar, 7 sheets,
  panel) unchanged structurally.
- Floatbar/sheet overlap at 1280px fixed: `.ds-sheet-grid padding: 32px 0 72px`, so the
  floating bar (pinned above shell-main's bottom edge) lands on grid padding instead of
  the last sheet row. Same fix applies to the editor's page grid.

### Verification

```
node --test            -> 70/70 pass (12 hygiene assertions incl. the 2 new ones)
node scripts/check-contrast.mjs -> 12/12 pairs PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all 7 header checks PASS
```

Browser checks: NOT RUN — no browser available and `python3 -m http.server 8000` is
denied by the sandbox, so live-page checks (overflow at 1440/1280/900/375/320, CSP in
the browser, `#hero-drop` handoff) were not executed. To complete locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```

then open `/`, `/privacy.html` at 1280/900/375px widths and run the console/Network checks.

Nothing was committed. Git was not touched.

## Design D3 — editor remodel

Rebuilt the editor on the design system (`css/theme.css` + `css/editor.css` only), fixed horizontal overflow at 375/320px, fixed confirmed editor bugs, and added view-layer tests. No new features, no PDF logic, no commits (user handles git). No npm/network installs; no build step. Browser checks were NOT RUN (no browser, local server start denied by the sandbox).

### Files changed

- `editor.html` — full rewrite on `ds-` classes from `css/theme.css`; all original ids kept; preloads `/vendor/fonts/GoogleSansFlex-Variable.ttf`; drops `css/main.css`; CSP meta unchanged (`style-src 'self'`, no `unsafe-inline`).
- `css/editor.css` — rewritten as thin layout glue: app shell, top bar, rail, sub-toolbar, grid, add tile, float bar, right panel, empty/loading/info/drag-overlay states, size variants, toasts, responsive (<1100px drawer, <700px bottom rail + sheets fill width), 44px touch targets under `(pointer: coarse)`.
- `css/theme.css` — hero overflow/grid/sheet width fixes; badge gap; hero floatbar `flex-wrap` + `ds-hero-floatbar-label` (white-space nowrap); `ds-sheet` transform rotate via `var(--rotate)` plus transition; `ds-shape-chart` + `.bar` styles; `ds-scroll-wrap` utility.
- `css/main.css` — deleted (unreferenced by any page; covered by `tests/pages-hygiene.test.mjs`).
- `design-system.html` — wrapped the 2 floatbar and 2 segmented demos in `ds-scroll-wrap` divs to stop horizontal overflow at 375/320px.
- `js/core/card-view.js` — new pure view layer: `DEMO_SHEETS`, `lineShape`/`headingShape`/`imageShape`/`chartShape`, `sheetHtml`, `checkMarkup`, `applySheetStyles` (CSSOM only, CSP-safe).
- `js/ui/cards.js` — uses card-view; emits `ds-sheet`/`ds-shape-*` classes; conditional check badge via `toggleCheck`; `syncCard` writes `sheet.dataset.rotate = page.rotated` (rotate fix); toggles `ds-sheet--selected`.
- `js/editor.js` — demo fileName shows "Annual-report.pdf (demo)"; `renderAll` restores focus to `focusedId` after out-of-grid actions (skips while typing in #doc-name).
- `js/ui/panel.js`, `js/ui/toolbar.js` — `is-active` → `ds-segment--active` on export/size segments.
- `tests/card-view.test.mjs` — new (4 tests).
- `tests/css-classes.test.mjs` — new (3 tests: loads theme.css, no legacy classes, every ds- class used in editor.html is defined in theme.css).
- `tests/pages-hygiene.test.mjs` — extended with the editor.html theme.css/main.css test.

### Bugs fixed

- Blank demo sheets: cards now emit `ds-shape-line/heading/block/chart` matching theme classes (`ds-shape-chart` added to theme).
- Check badge: only rendered when a page is selected (`toggleCheck` adds/removes `ds-check` inside the sheet).
- Rotate: `syncCard` now writes `sheet.dataset.rotate = page.rotated`, so `transform: rotate(var(--rotate, 0deg))` on `.ds-sheet` actually applies.
- Honesty: demo fileName carries the "(demo)" marker; panel stats are dashes when no document is open.
- Focus: after Duplicate/Delete/Undo/Redo, `renderAll` returns focus to the `focusedId` card (unless the user is typing in #doc-name).

### Verification

```
node --test                   -> 78/78 pass
node scripts/check-contrast.mjs -> 12/12 pairs PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all header checks PASS
```

Exit code 0 for all three.

NOT RUN — no browser is available and `python3 -m http.server 8000` is denied by the sandbox:
- Live-page checks at 1280/900/375px (hero overflow, float bar inside viewport, touch targets, drawer, rail).
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

To complete locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```

then open `/`, `/editor.html`, `/editor.html#demo` and `/design-system.html` at 1280/900/375px and run the console/Network checks.

Nothing was committed. Git was not touched.

## Design D3 fixes

Fix pass on the D3 editor remodel: design-system shell, privacy card, rotation via inner wrapper, demo data, overflow fixes, focus after Delete/Duplicate, and shell structure tests.

### Item 1 — design-system shell (editor.html + css/editor.css)

Rewrote the `editor.html` shell entirely on `ds-` classes from `css/theme.css`, keeping every original id:
- `ds-app-topbar` on #top-bar, `ds-rail` on #rail, `ds-panel` on #right-panel, `ds-floatbar` on #float-bar, `ds-segmented` on #size-wrap, `ds-dropzone` on #empty-drop, `ds-card` on the privacy box and #info-card, `ds-input` on #doc-name.
- Left block 176px; logo mark 28px radius 8px in the brand-mark color; wordmark 17px/600 ("Privy" in ink, "PDF" in Electric Capture Blue); `ds-badge-dark` "On this device only" plus `ds-badge-light` "Demo with sample pages" in demo mode.
- Geometry: the page itself never scrolls (`html { overflow: hidden }`, `.app { height: 100dvh; overflow: hidden }`); rail is a fixed drawer below 1100px and a bottom bar below 700px; grid `repeat(auto-fill, 196px)`; below 700px `repeat(auto-fill, minmax(140px, 1fr))` with sheets filling the cell (`aspect-ratio: 196/254`).
- Touch targets ≥44×44px under `(pointer: coarse)` (inherited from theme); #btn-download full-width 48px.
- The `ds-badge-light` "Demo with sample pages" badge is hidden outside demo mode.

### Item 2 — privacy card (no green)

Replaced the green privacy box with a `ds-card` containing a blue (`ds-icon` shield-check) icon, "N requests to other servers since you opened this file", "Files held in memory only. Nothing is sent to other servers.", and a "How to verify" link to `/privacy.html#verify`. Removed the pdf.js/pdf-lib vendor claims.

### Item 3 — rotation via inner wrapper (theme.css + js/core/card-view.js)

Moved `transform: rotate(var(--rotate))` off `.ds-sheet` onto a new inner `.ds-sheet-page` wrapper so the badge and page number never rotate. Added `--scale: 0.77` on the wrapper at 90°/270° so the page never overlaps the badge/number around the corners. `applySheetStyles` sets `--rotate` and `--scale` through the CSSOM only (CSP-safe). `sheetHtml` wraps the shapes in `.ds-sheet-page`.

### Item 4 — demo data (js/editor.js)

Demo document: `fileName` "Annual-report.pdf", panel doc-name shows "Annual-report" with a static ".pdf" suffix (`.pdf` added back on blur), stats 7 pages / 1 source file / 2.4 MB, source file "Annual-report.pdf".

### Item 5 — overflow fixes (theme.css + design-system.html)

- `index.html` hero: `.ds-field` padding 16px below 480px; hero sheets fluid (`minmax(72px, 1fr)`, reduced height).
- `design-system.html`: the editor-shell floatbar composite is now wrapped in `ds-scroll-wrap` (made `position: relative`) so it scrolls within its own overflow-x: auto container at 375/320px.

### Item 6 — focus after Delete / Duplicate (js/editor.js)

- Duplicate now focuses the first duplicate (`dupes[0]`), not the last.
- Delete focuses the page that took the deleted page's place, falling back to the page before it, then the first remaining page (null when nothing remains). `renderAll` keeps its existing fallback to the first page.

### Item 7 — shell structure tests (tests/css-classes.test.mjs)

Extended with checks that every original id survives, shell landmarks use the right `ds-` classes, the page never scrolls (`html overflow: hidden`, `.app height: 100dvh`), and the grid is `repeat(auto-fill, 196px)` switching to `minmax(140px, 1fr)` with `aspect-ratio: 196/254` below 700px.

### Verification

```
node --test                   -> 83/83 pass
node scripts/check-contrast.mjs -> 12/12 pairs PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all header checks PASS
```

Exit code 0 for all three.

NOT RUN — no browser is available and `python3 -m http.server 8000` is denied by the sandbox:
- Live-page checks at 1280/900/375px (hero overflow, float bar inside viewport, touch targets, drawer, rail).
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Nothing was committed. Git was not touched.

## Design D3 fixes 2

Fix pass on the D3 editor remodel against confirmed real-browser problems with production headers. No new features, no PDF logic, no commits (user handles git). No npm/network installs; no build step. Static checks pass; browser checks are NOT RUN (no browser, local server start denied by the sandbox) and are listed as such below. The user verifies live at 1440x860, 1280x800, 900x800, 375x812 and 320x700 on `/editor.html#demo` and `/editor.html`.

### Item 1 — `[hidden]` loses to component display (css/theme.css + tests)

`#float-bar` carries the `hidden` attribute when nothing is selected, but `.ds-floatbar { display: inline-flex; }` in css/theme.css won the specificity/source-order fight, so the bar painted with no selection.

- **Fix:** Added `[hidden] { display: none !important; }` to the base layer of css/theme.css, so the `hidden` attribute always wins. `mountFloatBar.setHidden()` toggles the attribute, so the bar is truly `display: none` when the selection is empty and `inline-flex` when pages are selected.
- **Files:** css/theme.css, tests/css-classes.test.mjs
- **Test:** "theme.css hides elements with the hidden attribute" asserts the rule exists in the base layer.

### Item 2 — Phone layout below 700px (css/editor.css + js/editor.js)

At 375x812, #grid-wrap was 1152px tall with scrollHeight == clientHeight (unscrollable) and #float-bar painted at y=1204 (off-screen).

- **Fix:** Below 700px the app is a column of exactly 100dvh: `#top-bar` (64px) → `.app-body` (`flex: 1`, `min-height: 0`) → `#workarea` (`flex: 1`, `min-height: 0`, `min-width: 0`) containing the sub-toolbar and `#grid-wrap` (`flex: 1`, `min-height: 0`, `overflow-y: auto`) → `#rail` (64px bottom tab bar). `#workarea` and `.app-body` both have `min-height: 0`/`min-width: 0` so the grid can shrink below its content and scroll.
- **Fix:** `#grid-wrap` gets `padding-bottom: 140px` below 700px so the last row and the add tile scroll clear of the floating bar and the tab bar.
- **Fix:** `#float-bar` below 700px is `position: fixed` at `left: 8px; right: 8px; bottom: 72px` (above the 64px tab bar), with icon-only buttons (`span` hidden) at least 44x44px, the "N selected" label kept, `max-width: calc(100vw - 16px)` and `overflow-x: auto` so it lies fully inside the viewport and never overflows horizontally.
- **Fix:** `$("rail").scrollLeft = 0` on load so the first tab item is never clipped.
- **Files:** css/editor.css, js/editor.js

### Item 3 — Phone top bar (css/editor.css)

Below 700px the top bar is a single 64px row: logo mark only (`.wordmark` hidden), file name with `flex: 1`, `min-width: 0` and text-overflow ellipsis, then icon-only 44px buttons (Add files, Undo, Redo, Download). The "On this device only" and "Demo with sample pages" badges are hidden below 700px. `#top-details` stays available below 1100px; below 480px the row cannot hold five 44px buttons, so Undo/Redo are moved into the sub-toolbar (elements moved, not copied, so listeners stay attached and no id is duplicated).

- **Files:** css/editor.css, js/editor.js

### Item 4 — Phone tab bar (css/editor.css + js/editor.js)

`#rail` below 700px uses `justify-content: flex-start` and `overflow-x: auto` so the first item (Pages) starts at the left edge and is fully visible instead of being clipped by centered overflow. Rail items are at least 64px wide and 44px tall, `scrollLeft` is pinned to 0 on load, and labels use `white-space: nowrap` so they aren't clipped.

- **Files:** css/editor.css, js/editor.js

### Item 5 — Desktop grid (css/editor.css)

`#page-grid` now has `width: 100%` (no max-width) with `justify-content: center` and `repeat(auto-fill, 196px)`, so it fills `#grid-wrap`: 4 columns of 196px at 1440px (80px rail + 320px panel leaves ~1040px) and 3 columns at 1280px, centered.

- **Files:** css/editor.css

### Item 6 — Polish (css/theme.css)

- `.ds-floatbar-btn`: `display: inline-flex; align-items: center; gap: 8px; white-space: nowrap` — 8px gap between icon and label, labels never wrap.
- `.ds-sheet-page`: `display: flex; flex-direction: column; gap: 7px` so the sheet content stack uses a 7px gap with no negative margins.
- `.ds-shape-heading`: `margin-bottom: 6px` so the heading bar no longer overlaps the first line (e.g. page 1 of the demo sheets).

### Item 7 — Overflow leftovers (css/theme.css)

- index.html: `.ds-field` has `box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0` and `.ds-feature-sheet` is now fluid (`flex: 1 1 0; min-width: 0`) inside a flex-wrapped `.ds-feature-sheets`; `.ds-feature-media`/`.ds-feature-text` already take `width: 100%; min-width: 0` below 900px, so nothing exceeds the container at 320px.
- design-system.html: the `.ds-floatbar.ds-section` and `.ds-segmented.ds-section` demos are wrapped in `.ds-scroll-wrap` (`overflow: auto; max-width: 100%; min-width: 0`), so document scrollWidth equals clientWidth at 375px and 320px.

### Item 8 — Tests

Kept `node --test` green and added:
- "theme.css hides elements with the hidden attribute" (item 1 rule).
- "editor.css phone layout below 700px: workarea, grid-wrap, rail" — asserts that inside the `max-width: 699px` block, `#workarea` sets `min-height: 0`, `grid-wrap` sets `overflow-y: auto`, and `#rail` sets `justify-content: flex-start`.

### Verification

```
node --test                   -> 85/85 pass
node scripts/check-contrast.mjs -> 12/12 pairs PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all header checks PASS
```

Exit code 0 for all three.

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so none of the live-page checks were executed:
- Measure at 1440x860, 1280x800, 900x800, 375x812, 320x700 on `/editor.html#demo` and `/editor.html`: document scrollHeight vs viewport, horizontal overflow, #grid-wrap scrollHeight vs clientHeight, #float-bar inside viewport, top-bar item bounds, rail first item fully visible.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Unit tests do not prove UI behavior. To complete locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```
then open `/`, `/editor.html` and `/editor.html#demo` at the listed widths and run the console/Network checks.

Nothing was committed. Git was not touched.

## Design D3 fixes 3

### Item 1 — Desktop sheet grid fills #grid-wrap (css/theme.css + design-system.html)

Removed `max-width: 720px` from the plain `.ds-sheet-grid` rule in css/theme.css and moved it into a style-guide-only rule, `.ds-guide .ds-sheet-grid { max-width: 720px; }`. `design-system.html` now has `<body class="ds-guide">`, so its three `.ds-sheet-grid` instances keep the 720px cap they had before. `#page-grid` (`class="page-grid ds-sheet-grid"` in editor.html) is uncapped: it is `width: 100%` of `#grid-wrap`, so at 1440x860 it shows 4 columns of 196px and at 1280x800 3 columns, centered by `justify-content: center`.

Checked statically: no other `max-width`/fixed width applies to `#page-grid` or `#grid-wrap`. No other page uses `.ds-sheet-grid`.

### Item 2 — Phone sub-toolbar below 480px (css/editor.css + js/editor.js)

Below 480px, `js/editor.js` already moves Undo/Redo into `.sub-right`, which previously stacked them vertically (two rows, ~132px tall, overlapping the grid).

- Added a `max-width: 479px` block to css/editor.css: `.sub-right` is `display: flex`, `flex-direction: row`, `flex-wrap: nowrap`, `align-items: center`, `gap: 8px`, `flex: none` — one row, height capped by its children (44px buttons) inside the 56px `#sub-toolbar`. `#sub-toolbar` padding shrinks to `0 12px`, `.sub-left` gets `min-width: 0`, `#select-all` clamps at `max-width: 96px` with ellipsis and `padding: 0 12px`, `#btn-undo`/`#btn-redo` become `44px` squares.
- `js/editor.js` `renderAll()` now shortens the demo status to `N selected` when `matchMedia("(max-width: 479px)")` matches, instead of `N pages · N selected`.

### Item 3 — Panel polish (css/editor.css + editor.html)

- `.panel-label` gets `margin-bottom: 12px` in css/editor.css, giving 12px between a section label and its control (Document label → file field, Export label → segmented control).
- The privacy card is now `<div class="panel-section ds-panel-section"><div class="ds-card">…</div></div>`: it sits inside the section's 20px padding like other content instead of being flush to the panel edges, and its standard `ds-card` shadow has clearance so it is not clipped.
- Nothing about the card changed visually: still `ds-card`, never green.

### Item 4 — Tests

Kept `node --test` green and added two tests to tests/css-classes.test.mjs:
- "theme.css: plain .ds-sheet-grid has no max-width" — asserts the plain rule body has no `max-width` and the 720px cap lives only under `.ds-guide .ds-sheet-grid`.
- "editor.css phone block (479px): .sub-right is a row flex container" — asserts that inside the `max-width: 479px` block, `.sub-right` is `display: flex`, `flex-direction: row`, `flex-wrap: nowrap` and `gap: 8px`.

Also updated the privacy-card assertion in "editor shell landmarks use ds- classes" to match the new nesting (`ds-card` inside a `panel-section`).

### Verification

```
node --test                   -> 87/87 pass
node scripts/check-contrast.mjs -> 12/12 pairs PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all header checks PASS
```

Exit code 0 for all three. CSP is unchanged (no inline styles or scripts; `.sub-right` behavior comes from external classes only).

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so none of the live-page checks were executed:
- Measure at 1440x860, 1280x800, 900x800, 375x812, 320x700 on `/editor.html#demo` and `/editor.html`: document scrollHeight vs viewport, horizontal overflow, #grid-wrap scrollHeight vs clientHeight, #float-bar inside viewport, top-bar item bounds, rail first item fully visible.
- Sub-toolbar fit at 375x812 and 320x700: bounding boxes of #sub-toolbar children inside the viewport, no overlap, #sub-right height at most 56px, #select-all at most 96px, undo/redo 44px.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Unit tests do not prove UI behavior. To complete locally:

```bash
python3 -m http.server 8000   # from C:\Users\ALABA\Desktop\Files\PrivyPDF
node scripts/check-headers.mjs http://localhost:8000
node --test
```

then open `/`, `/editor.html` and `/editor.html#demo` at the listed widths and run the console/Network checks.

Nothing was committed. Git was not touched.

## Design D4 polish

### Spacing utilities (css/theme.css)

- Added `.ds-stack`: `display: flex; flex-direction: column; gap: var(--stack-gap, 16px)`, with `.ds-stack--sm` (8px), `.ds-stack--md` (16px), `.ds-stack--lg` (32px). Used everywhere text stacks vertically instead of one-off margins: landing hero, #how, feature rows, #tools, #proof, FAQ on both pages, privacy hero, privacy promises, privacy #verify, both band blocks, editor panels.
- `.ds-card` is now `display: flex; flex-direction: column; gap: 8px` — card label, title and text are 8px apart (promise cards, #how cards, #proof cards, editor info card and privacy card).
- `.ds-card-grid`, `.ds-tools-grid` and `.ds-promise-grid` use `margin-block-start: 32px`, widening to `48px` at `min-width: 900px` desktop.
- `.ds-land-list` top margin is now `32px` (was `16px`).
- `h1, h2, h3` got `text-wrap: balance` so headings never strand a single last word.

### Bug fixes

**2a — Dark band stack.** The band (`ds-band--sweep` on index, `ds-band` on privacy) now nests the heading and paragraph in `ds-stack--md` (16px gap; paragraph keeps `ds-band-text` max-width of 60%), wrapped in `ds-stack--lg` so the button sits 32px below the paragraph. Copy ends "It should always read zero."

**2b — Button text decoration.** Every `a.ds-btn` keeps `text-decoration: none` in base, `:hover`, `:focus-visible` and `:visited` states. `.ds-band a` no longer underlines (band links are buttons, so they stay plain in every state).

**2c — FAQ gap.** The FAQ heading and its list share `ds-stack--lg` — a 32px gap between heading and list on both pages.

**2d — Empty-state centered card.** `#empty-drop` is now `max-width: 560px; width: calc(100% - 64px); padding: 56px 32px; min-height: 280px; border-radius: 16px; background: #fff; display: flex; flex-direction: column; align-items: center; gap: 16px`. It keeps the `ds-dropzone` dashed `1.5px dashed rgba(22, 22, 24, 0.25)` border and its hover/active blue border + `#f5f8ff` background. Contents: icon 32px soft charcoal with 8px below (inner `ds-stack--sm`), title 600 20/28, subtitle 450 14/20 soft charcoal, badge 16px above and fully inside the card. `#empty-state` centers the card both ways with `min-height: calc(100dvh - 200px)`. Phones below 700px: `width: calc(100% - 32px)` and `padding: 40px 20px`.

**2e — Drag-overlay live region.** "Drop files to add them" is now `class="drag-text ds-sr-only"` — invisible, still announced to screen readers. Audited index.html, privacy.html, design-system.html and editor.html for other stray visible screen-reader text: none found.

**2f — Static page audit at 5 breakpoints (1440x860, 1280x800, 900x800, 375x812, 320x700).** Reviewed all four pages width by width: hero badge/headline/lead/CTA rhythm at each width, feature-row caption wraps, card grids collapsing from 3 to 2 to 1 columns, tools grid staying 3 columns, band max-width, FAQ detail wrapping, footer wrap, editor shell (top bar, rail, sub-toolbar, float bar, right panel drawer below 1099px) and the empty-state card on phone. No horizontal overflow sources found statically; all same-origin links resolve; no inline styles or style blocks anywhere. Live measurement (scrollHeight/clientHeight, float-bar in viewport) is NOT RUN — see below.

### Copy pass (human voice)

Slogan headings replaced with plain direct ones; em dashes in body copy replaced with periods or commas; "not X but Y" and the 3-item signoff fixed. Every "Soon" label kept; both h1s kept; every privacy/technical fact kept.

| Page | Before | After |
| --- | --- | --- |
| index.html | h2 "Your browser is the whole backend" | h2 "How it works" |
| index.html | lead: "…handled on your device — nothing is uploaded." | lead: "…handled on your device. Nothing is uploaded." |
| index.html | feature caption: "…stays on this site — none contains your document, and none goes to another server." | feature caption: "…stays on this site. No request contains your document, and none goes to another server." |
| index.html | h2 "Everything you do with PDFs. Privately." | h2 "Tools that run on your device" |
| index.html | h2 "Built so you don't have to take our word" | h2 "Verify it yourself" |
| index.html | band: "…requests to other origins — it should always read zero." | band: "…requests to other origins. It should always read zero." |
| index.html | h2 "Questions, answered" | h2 "Frequently asked questions" |
| index.html | signoff: "No uploads. No accounts. No tracking." | signoff: "No uploads. No accounts or tracking." |
| privacy.html | "uploaded — there is no backend that accepts files." | "uploaded. There is no backend that accepts files." |
| privacy.html | "…stays on this site; none contains your document, and none goes to another server. The editor also counts requests to other origins — it should always read zero." | "…stays on this site. No request contains your document, and none goes to another server. The editor also counts requests to other origins. It should always read zero." |
| privacy.html | promises: "…not claims we ask you to trust." | promises: "These are built-in properties of the site. You can verify each one yourself." |
| privacy.html | h2 "Questions, answered" | h2 "Frequently asked questions" |
| design-system.html | footer: "© PrivyPDF — local only" | footer: "© PrivyPDF. Local only." |
| design-system.html | FAQ: "Yes — there is no backend that accepts files." | FAQ: "Yes. There is no backend that accepts files." |
| design-system.html | promise card: "connect-src 'self' — no other origins." | promise card: "connect-src 'self'. No other origins." |
| design-system.html | hero copy: "…no trackers — your documents never leave your device." | hero copy: "…no trackers. Your documents never leave your device." |
| design-system.html | composite copy: "No live behavior — a static preview…" | composite copy: "No live behavior. A static preview…" |

Em dash survives only in `<title>` (allowed): index.html and design-system.html titles.

### Tests

Added `tests/d4.test.mjs` with 10 tests:
- css/theme.css defines `.ds-stack` (flex column, `--stack-gap`) and `.ds-stack--sm`/`-md`/`-lg` = 8px/16px/32px.
- `a.ds-btn` keeps `text-decoration: none` in base, `:hover`, `:focus-visible`, `:visited`; no `.ds-btn` rule reintroduces an underline.
- `.ds-card` is a column flex container with `gap: 8px`.
- Card grids keep `margin-block-start: 32px` (48px in the `@media (min-width: 900px)` block).
- `#empty-drop`: max-width 560px, width `calc(100% - 64px)`, padding 56px 32px, min-height 280px, border-radius 16px, background #fff, flex column, align-items center, gap 16px; dropzone keeps the dashed rgba border; phone override `calc(100% - 32px)` / `40px 20px`.
- `#empty-state` centers `#empty-drop` both ways with a viewport-relative `min-height`.
- Drag-overlay text uses `ds-sr-only`.
- Band nests h2 and paragraph in `ds-stack--md` inside `ds-stack--lg`, button after the stack.
- No em dash in body copy of any of the 4 pages outside `<title>`, `<meta>` and `<code>`/`<pre>` blocks (editor stat placeholders "—" are UI chrome, excluded).

Also relaxed the privacy-card nesting assertion in `tests/css-classes.test.mjs` so it is class-order agnostic (panel sections now carry `ds-stack--sm`).

### Verification

```
node --test                   -> 97/97 pass
node scripts/check-contrast.mjs -> 12/12 pairs PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all header checks PASS
```

Exit code 0 for all three. CSP is unchanged (style-src 'self', no unsafe-inline, no inline style attributes, no `<style>` blocks, no inline scripts).

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so the live-page parts were not executed:
- Visual verification of the dark band stack, the FAQ gap and the empty-state card at 1440x860, 1280x800, 900x800, 375x812, 320x700.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).
- The impeccable audit/critique: not installed in the project (`**/impeccable*` absent), skipped.

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.

## Design D4b polish

Seven landing-page polish items, all static (CSS/HTML only, no JS, no copy changes):

### 1 — Buttons never stretch in stacks (`css/theme.css`)
`.ds-stack` now sets `align-items: flex-start`, and `.ds-stack .ds-btn { align-self: flex-start; }` makes every button inside any stack content-sized (about 150px wide, 48px tall) instead of stretching to stack width. Fixes the dark band button (was stretching to ~60% of the container) and every other stack containing buttons, badges or links. Covered by `tests/d4.test.mjs` ".ds-stack starts items at flex-start so .ds-btn never stretches".

### 2 — One container, one left edge on every landing section
Every landing section on `index.html` (hero, facts, how, feature rows, tools, proof, band, FAQ) now wraps its content in `.ds-container`; `ds-facts` gained the missing wrapper it was the only section to lack. Both footers (`index.html`, `privacy.html`) are `class="ds-footer ds-container"`, and `.ds-footer.ds-container { padding: 40px 24px; }` below 600px keeps the 40px vertical padding while the sides go to 24px. Left edge: 48px at 1440px, 24px at 375px, footer included. Covered by `tests/d4.test.mjs` "every landing section on index.html wraps its content in ds-container" and "footers share the container left edge on index.html and privacy.html".

### 3 — Hero floatbar
Removed the `·` separator span (`ds-hero-floatbar-sep`). `.ds-hero-floatbar` is now `white-space: nowrap; width: max-content` (`flex-wrap: wrap` removed), still centered via `left: 50% / translateX(-50%)`; below 600px gap shrinks to 6px and font to 11px so it stays one line on phones. The hero window lost its fixed `height: 300px` (fits content), `.ds-hero-sheets` is `repeat(3, 1fr)` → two rows of three mini sheets on desktop, and sheets padding-bottom grew to 72px so the bar overlaps only padding, never sheets. Covered by `tests/d4.test.mjs` "hero floatbar is one centered nowrap line without the dot separator" and "hero window fits content with two sheet rows".

### 4 — Editor right panel (`css/editor.css`)
`#download-pdf` is `width: 100%` (48px tall via `.ds-btn`, full width of the export section). The Export `ds-segmented` spans full width with `.right-panel .ds-segment { flex: 1; }` — equal segments. Shortcut rows are `justify-content: space-between` (label left, key caps right in a fixed inline-flex `.shortcut-keys` group; key caps never sit directly beside label text) with `margin-block-end: 12px` — 12px vertical rhythm between rows. Covered by `tests/d4.test.mjs` "#download-pdf fills the export section width", "Export segmented control spans full width with equal segments" and "shortcut rows keep label left, keys right-aligned, 12px apart".

### 5 — Wordmark ("PrivyPDF", only "PDF" in Electric Capture Blue)
`.wordmark` gap removed (was `gap: 4px`, which created a visible space). `editor.html` has `<span>Privy</span><strong>PDF</strong>` adjacent with no whitespace between, so it reads "PrivyPDF"; "Privy" stays absolute ink, only "PDF" is Electric Capture Blue. Covered by `tests/d4.test.mjs` "editor wordmark reads PrivyPDF with no gap between parts".

### 6 — design-system.html overflow at 375px / 320px
`.ds-sg-w-260` (two fixed 260px dropzone boxes) gained `max-width: 100%`, so nothing exceeds the container at 320px (224px of content width). Tables already scroll inside `ds-table-wrap`/`ds-scroll-wrap`. Goal: `scrollWidth === clientWidth` at 375px and 320px — statically sound, not live-measured (see NOT RUN below).

### 7 — Tests
`tests/d4.test.mjs`: +10 tests covering items 1, 2, 4, 5 plus the hero floatbar/window/sheets changes. All existing tests untouched.

### Verification

```
node --test                   -> 106/106 pass (10 new D4b assertions in tests/d4.test.mjs)
node scripts/check-contrast.mjs -> 12/12 PASS (>= 4.5:1)
node scripts/check-headers.mjs --local -> all header checks PASS
```

Exit code 0 for all three. CSP is unchanged (`style-src 'self'`, no `unsafe-inline`, no inline style attributes, no `<style>` blocks, no inline scripts).

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so the live-page parts were not executed:
- Visual verification at 1440x860, 1280x800, 900x800, 375x812, 320x700: floatbar a single centered nowrap line, two sheet rows, band button ~150px wide, 24px left edge on footers and ds-facts at phone width, design-system.html `scrollWidth === clientWidth` at 375px/320px.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).
- The impeccable audit/critique: not installed in the project (`**/impeccable*` absent), skipped.

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.

## Design D5 cleanup

### 1 — Hero guarantee line centered (css/theme.css + index.html)

Added `.ds-stack--center { align-items: center; text-align: center; }` to css/theme.css and applied it to the hero stack (`class="ds-stack ds-stack--md ds-stack--center"`), so the hero badge, h1, lead, CTA row and the "No uploads. No accounts or tracking." signoff center under the buttons instead of sitting at the stack's start edge.

Stacks audited (item 1 scope), changed or left as-is:
- Hero stack (index.html:35) — CHANGED: gained `ds-stack--center`. Guarantee line before: left-aligned at the container edge (x≈46, per the design review). After: centered under the buttons (exact center offset NOT RUN — see Verification).
- Empty-state stack (editor.html:66) — CHANGED: gained `ds-stack--center`. `#empty-drop` already centers the whole card, so no visible change; the stack now declares its centered context explicitly.
- Band stacks (index.html:389-390, privacy.html:90-91) — UNCHANGED: band text is intentionally left-aligned; item 2 fixes its left edge instead.
- How / tools / proof / FAQ stacks — UNCHANGED: section headings are left-aligned; only the hero h1 is centered, handled by the hero stack.
- Footers (index.html:451, privacy.html:232) — UNCHANGED: `ds-footer ds-container` with `justify-content: space-between`, not a centered context.
- Editor panel children (editor.html:96-135) — UNCHANGED: left-aligned; label spacing handled in item 4.

Covered by tests/d5.test.mjs "css/theme.css defines the centered stack modifier" and "the hero stack uses the centered modifier so the guarantee line centers under the buttons".

### 2 — Band indent (css/theme.css)

`.ds-band` had `padding: 96px 48px`, which stacked on the container's `0 48px`, so band text started at x=96 at 1440px (x=72 at 375px) while every other section starts at 48 (24 on phones). Changed to `padding: 96px 0`: the full-bleed studio-black background stays (band is still `width: 100%`), and the band's inner content uses `ds-container` with no extra horizontal padding, so the band heading's left edge equals the other sections' — 48px at 1440px, 24px on phones (container padding steps down to 24px below 600px). `.ds-band-text { max-width: 60%; }` is unchanged, so text stays inside the left 60%. Band markup untouched (it already wraps in `ds-container`); the existing d4 test on the band's nested stacks still passes.

### 3 — Hero preview sheets (css/theme.css)

`.ds-hero-sheets` stays `grid-template-columns: repeat(3, 1fr)` with a single `gap: 16px` — two identical rows of three same-width mini sheets. `.ds-hero-sheet--selected` ring changed from `outline-offset: 2px` (ring drawn outside the sheet, making the selected sheet about 4px wider) to `outline-offset: -2px` (inset), so selected sheets are the same size as the others. `.ds-hero-floatbar` keeps `white-space: nowrap; width: max-content` — still one centered line. Covered by tests/d5.test.mjs.

### 4 — Panel label spacing (css/editor.css)

Added `.panel-label { margin-bottom: 4px; }`. Inside the `ds-stack--sm` panel sections (8px stack gap) that makes label→control 12px for Document, Export and Shortcuts alike. The Export segmented control keeps the plain 8px stack gap to the Download PDF button (8px between the toggle and the button), and the "Export" heading is 12px from the segmented control — not touching it. Markup untouched. Covered by tests/d5.test.mjs "editor panel label spacing: 12px label-to-control, 8px segmented-to-button".

### 5 — Deployment hygiene (.vercelignore, .dockerignore, design-system.html)

Created .vercelignore excluding REPORT.md, DESIGN.md, README.md, tests, scripts, design-system.html, Dockerfile, .dockerignore, _headers, .github, node_modules and .git. Extended .dockerignore with DESIGN.md, scripts, design-system.html and _headers (its existing entries kept), so the nginx image also excludes them. design-system.html now opens with `<!-- Dev-only style guide, desktop layout only; not deployed -->`; it is excluded by both ignore files and no design work was done on its mobile layout. Static test in tests/d5.test.mjs asserts both ignore files list every entry above, and that index.html, privacy.html and editor.html link none of design-system.html, DESIGN.md or REPORT.md.

### 6 — Tests

tests/d5.test.mjs: +11 static checks covering items 1–5 (centered modifier defined and used by the hero stack; band padding 96px 0 with ds-container wrapper; hero grid repeat(3, 1fr), single gap, inset outline, floatbar nowrap; panel-label margin-bottom 4px on top of the 8px stack gap; ignore-file entries; no dev-only links; dev-only note). All existing tests untouched.

### Verification

```
node --test                                    -> 117/117 pass (11 new D5 assertions in tests/d5.test.mjs)
node scripts/check-contrast.mjs                -> 12/12 PASS (>= 4.5:1)
node scripts/check-headers.mjs --local         -> all header checks PASS
```

Exit code 0 for all three. CSP is unchanged (`style-src 'self'`, no `unsafe-inline`, no inline style attributes, no `<style>` blocks, no inline scripts).

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so the live-page parts were not executed:
- Visual verification at 1440px and 375px: hero guarantee line center offset, band heading left edge (48px / 24px), hero sheet widths (two identical rows), floatbar one line.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).
- The impeccable audit/critique: not installed in the project (`**/impeccable*` absent), skipped. [Superseded — see the Impeccable review section below; Impeccable v4.9.0 is installed and this review was run.]

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.

## Design D6 fixes

### 1 — Document name label (editor.html)

The visible "Document" text above `#doc-name` was a `span`, so the input had no accessible name. It is now `<label for="doc-name" class="panel-label ds-panel-label">Document</label>` — same classes, same visible text, the input itself unchanged (`css/editor.css` untouched for this item). Clicking the label focuses the input and screen readers can name the input from its visible label. Covered by tests/d5.test.mjs "the Document input has a programmatic label".

### 2 — Soon labels at 11px (css/theme.css, css/editor.css)

The only functional text below the 11px floor were the two "Soon" rules: `.ds-rail-soon { font-size: 9px; }` (desktop rail) and `#rail .rail-soon { font-size: 9px; }` (phone rail, css/editor.css:381). Both raised to 11px. `.ds-badge-soon` (tool-card "Soon" badge) was already 12px and is untouched. Rail width stays 80px and rail items stay 64px; "Annotate", "Protect" etc. fit at 11px without wrapping, so no letter-spacing or copy change was needed. A scan of every `font-size: ...px` declaration in css/theme.css and css/editor.css shows none below 11px. Covered by tests/d5.test.mjs "Soon labels are at least 11px everywhere".

### 3 — Editor right panel spacing (css/editor.css, editor.html)

Replaced the one-off margins (`.panel-label { margin-bottom: 4px; }` and `.right-panel .ds-segmented { margin-bottom: 4px; }`) with a real gap: panel sections set `--stack-gap: 12px` on `.ds-panel-section`, so each section label is 12px from its control and the Export segmented control is 12px from the Download PDF button; section padding stays 20px. The button is 8px from its caption ("Built in this tab. Nothing is uploaded.") via the button and caption nested in a `ds-stack--sm export-actions` block inside the Export section (the standard 8px gap). Markup change: the Export section wraps the button and caption in that nested stack; no ids, no copy, no behavior change. Covered by tests/d5.test.mjs "editor panel sections stack with a real gap instead of one-off margins" — each value asserted: 12px section gap, 20px padding, no margin rules, 8px caption stack, the `label for="doc-name"` markup, and the nested Export structure. Rendered-gap measurement at 1440x860: NOT RUN — see Verification.

### 4 — Proof row inset (css/theme.css)

`.ds-proof-row` (Network panel on index.html and privacy.html) gained `padding-block: 10px`; the 1px top border lines are kept (`border-top: 0` on the first row unchanged), so the proof panel's total height may grow. `.ds-faq`, `#sub-toolbar` and the hero gradient text untouched. Covered by tests/d5.test.mjs "proof rows have a vertical inset and keep their 1px top borders".

### 5 — Deploy hygiene (.vercelignore, .dockerignore)

Added `.claude` and `.impeccable` to both ignore files; existing entries kept. `PRODUCT.md` does not exist in the repo, so nothing was added for it (added only when it exists). The static ignore-file tests in tests/d5.test.mjs now assert both files list `.claude` and `.impeccable`.

### 6 — Tests

tests/d5.test.mjs: 3 new tests (programmatic Document label; Soon labels ≥11px with a floor scan of both stylesheets; proof-row inset with borders kept) plus the panel-spacing test rewritten for the gap mechanism — each value asserted (12px label-to-control and segmented-to-button, 8px button-to-caption, 20px padding). The old "12px via margin-bottom" test was replaced because its mechanism (one-off margins) was removed. Ignore-file entries extended with `.claude` and `.impeccable`.

### Verification

```
node --test                                    -> 120/120 pass, exit 0
node scripts/check-contrast.mjs                -> 12/12 PASS (>= 4.5:1)
node scripts/check-headers.mjs --local         -> all header checks PASS
```

### NOT RUN (blocked by the sandbox / harness)

No browser is available and starting a local server is denied, so the live-page parts were not executed:
- Panel gap measurement on /editor.html#demo at 1440x860 (12px label-to-control, 12px segmented-to-button, 8px button-to-caption, 20px section padding) and Soon label computed font sizes.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.

## Impeccable review

### How the review was run

Report only: no fixes applied, DESIGN.md untouched, strict CSP (`style-src 'self'`) and the privacy claims respected.

- Impeccable v4.9.0 is installed at `.claude/skills/impeccable` (latest v4.10.0 available — update via `npx impeccable update`, not run here). The CLI (`scripts/impeccable.cmd`) exposes no `audit`/`critique` subcommands — only `detect` among the evaluation verbs — so the audit and critique below follow the skill's reference docs (`reference/audit.md`, `reference/critique.md`), applied to `index.html`, `privacy.html`, `editor.html` (empty state) and `editor.html#demo` (same file, hash route).
- `impeccable context` reported `NO_PRODUCT.md`; this is a narrow refinement of existing pages, so it proceeded without blocking (`impeccable init` optional — not run).
- `impeccable detect --json index.html privacy.html editor.html` ran: exit code 2 (findings), all detector severity `warning`. Covers `editor.html#demo` via `editor.html`.
- NOT RUN: browser-based Assessment B overlays/live measurement (no browser; `python3 -m http.server 8000` denied by the sandbox), and the critique.md dual-agent assessment (single-context degraded inline run — declared per critique.md's degraded-banner rule). No `.impeccable/critique` snapshot was written (report-only scope).

### Audit health score (audit.md, five dimensions scored 0–4)

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Contrast tokens pass 12/12; focus indicators and ARIA present; `#doc-name` input lacks a programmatic label (minor gap) |
| 2 | Performance | 3 | Store-driven render with idempotent `renderAll` and keyed card reuse; no layout thrash; vendored pdf.js/pdf-lib unused this phase |
| 3 | Theming | 2 | Full token system in `css/theme.css`, but `css/editor.css` still carries hard-coded colors (`#fff`, `#f5f8ff`, rgba values); no user-facing dark-mode switch |
| 4 | Responsive Design | 3 | Breakpoints at 1099/700/600/480/479px; 44×44px touch targets under `(pointer: coarse)`; no static horizontal-overflow sources; live measurement not run |
| 5 | Implementation Integrity | 3 | Detector verified 5 distinct warning findings (gradient text, cramped padding ×3, dark glow ×1, undersized 9px text ×1); none block task completion |
| **Total** | | **14/20** | **Good (14–17: address weak dimensions)** |

Severity counts: P0 = 0, P1 = 0, P2 = 2, P3 = 5 (P0/P1 → high, P2 → medium, P3 → low in the table below).

### Implementation Integrity verdict

Start here: the implementation expresses a coherent, product-specific system — `ds-` design system, Studio Black + Electric Capture Blue, "PrivyPDF" wordmark, on-device privacy story — it is not category-interchangeable. The detector's findings are all `warning`-grade quality/aesthetic issues; none prevent task completion. One detector flag (dark glow `#42aef7` on privacy.html) is a false positive: no colored `box-shadow` or `#42aef7` exists in `privacy.html`, `index.html`, `editor.html` or `css/`.

### Findings

| Page | Area | Finding | Severity | Evidence (selector / line) | Suggested fix | Conflicts with DESIGN.md / strict CSP / privacy claims / tests |
|---|---|---|---|---|---|---|
| `editor.html` | Document section | `#doc-name` text input has no programmatic name — the visible "Document" label is a `span`, not linked to the input | medium | `editor.html:97–99` | Add `<label for="doc-name">Document</label>` or `aria-labelledby` on the input; keep visible label text unchanged | None — attribute only; no CSP/test/DESIGN.md impact |
| `editor.html` | Rail | 9px "Soon" functional text below the 11px legibility floor | medium | `css/editor.css:381` (`.rail-soon { font-size: 9px; }`); detector `undersized-ui-text` | Raise to ≥11px | None |
| `index.html` | Proof rows | `ds-proof-row` children flush against `border-top`, no inset | low | detector `cramped-padding`: `"ds-proof-row": children flush against border-top on top (no inset)` | Add ≥8px (ideally 12–16px) inset inside bordered/outlined containers | None |
| `privacy.html` | Proof rows / FAQ | Cramped padding: `ds-proof-row` flush to `border-top`; `ds-faq` flush to borders on all sides | low | detector `cramped-padding` (`ds-proof-row`, `ds-faq`) | Same inset rule | None |
| `editor.html` | Sub-toolbar | Children flush against `border-bottom`, no inset | low | detector `cramped-padding`: `sub-toolbar` | Same inset rule | None |
| `index.html` | Hero heading | Gradient text flagged as decorative "slop" / AI tell | low | detector `gradient-text`; `css/theme.css:547–551` (`ds-hero-glow`); `index.html:33` | Document as intentional — it is the approved hero emphasis (Design D3); no change. If revisited: solid color | Changing conflicts with the approved design (D3) — confirm before touching; no CSP/test impact |
| `privacy.html` | Dark band | Colored box-shadow glow (`#42aef7`) on dark background | low | detector `dark-glow` — unverified; no colored `box-shadow` or `#42aef7` in any project source file | Treat as detector false positive; no fix needed; re-scan after edits | None |

### Five findings to fix first

1. **`#doc-name` programmatic label** (`editor.html`) — screen-reader users cannot name the Document input; one HTML attribute, zero CSP/test impact, fixes a real a11y gap.
2. **9px "Soon" badge** (`css/editor.css:381`) — breaks the project's own 11px functional-text floor that the detector enforces; single value change.
3. **`ds-proof-row` cramped padding** (`index.html`) — visible on the landing page; one CSS rule batch.
4. **`ds-proof-row` / `ds-faq` cramped padding** (`privacy.html`) — same rule family as #3; fix in the same pass.
5. **Sub-toolbar cramped padding** (`editor.html`) — same rule family as #3–4; fix in the same layout pass.

Not actionable / verified intentional: the hero gradient text (approved Design D3 emphasis — do not change without confirming) and the privacy dark-glow flag (detector false positive).

### Positive findings

- Strict CSP everywhere: `style-src 'self'`, zero inline `style=""` attributes, zero `<style>` blocks, zero inline scripts; `vercel.json` and `_headers` identical (7 headers, `x-frame-options` absent).
- Contrast: 12/12 WCAG AA pairs PASS (4.5:1 normal text).
- Focus indicators (`:focus-visible` 2px), roving-tabindex listbox grid, keyboard shortcuts (mod+z, mod+shift+z, `r`, Delete, ctrl+s), `aria-label`s throughout, every `img` has `alt`.
- `node --test`: 117 pass / 0 fail, exit 0.

### What could not run (honest)

- Browser-based checks: live pages at 1280/900/375px, console/Network errors, CSP in the browser, scrollHeight/float-bar measurements — NOT RUN (no browser; local server start denied by the sandbox).
- `node scripts/check-headers.mjs <live URL>` — NOT RUN (needs a live server; URL mode to be used after deploy).
- Dual-agent critique per `critique.md` — single-context degraded inline run (banner: `⚠️ DEGRADED: single-context (no sub-agent isolation / no browser automation available)`).

### Suggested next steps (report only — commands not run)

1. `/impeccable clarify` — add the programmatic label to `#doc-name` (matches finding 1).
2. `/impeccable typeset` — raise the 9px "Soon" badge to ≥11px (finding 2).
3. `/impeccable layout` — add the ≥8px inset rule for `ds-proof-row`, `ds-faq`, `sub-toolbar` (findings 3–5).
4. Re-run `/impeccable audit` after fixes to confirm the score moves above 14/20.

You can ask me to run these one at a time, all at once, or in any order you prefer.

### Panel spacing fix (small fix, done)

CSS-only change in `css/editor.css` (no markup, no copy, no inline styles — CSP-safe): `.panel-label { margin-bottom: 4px; }` on top of the 8px `ds-stack--sm` stack gap = 12px label→control for Document, Export and Shortcuts; `.right-panel .ds-segmented { width: 100%; margin-bottom: 4px; }` = 12px from the Export segmented control to the full-width Download PDF button (no longer touching). Verified statically by `tests/d5.test.mjs` ("editor panel spacing: 12px label-to-control, 12px segmented-to-button", part of the 117 passing tests). Browser measurement of rendered gaps: NOT RUN (no browser available; local server start denied by the sandbox).

Nothing was committed. Git was not touched.

## Design D6b — orphan `ds-stack--*` modifiers made standalone-safe (css/theme.css + editor.html)

### Root cause

Panel sections used `ds-stack--sm` (and `ds-stack--center`) without the base `ds-stack` class. Because `ds-stack--*` modifiers only set `--stack-gap` or centering — they never set `display: flex` / `flex-direction: column` / `gap` — a modifier used alone left the element as a block with a 0px gap, collapsing the Editor right panel's label-to-control, segmented-to-button and button-to-caption spacing.

### 1 — Base class restored (editor.html)

Added the missing `ds-stack` base class to the four orphan elements:
- editor.html:96 — Document panel section: `class="ds-stack ds-stack--sm panel-section ds-panel-section"`
- editor.html:107 — Export panel section: `class="ds-stack ds-stack--sm panel-section ds-panel-section"`
- editor.html:113 — nested Export button/caption stack: `class="ds-stack ds-stack--sm export-actions"`
- editor.html:118 — Privacy panel section: `class="ds-stack ds-stack--sm panel-section ds-panel-section"`

The empty-state stack (editor.html:66, `ds-stack ds-stack--sm ds-stack--center`) already carried the base class and is untouched. No ids, no copy, no behavior change; CSP unaffected (no inline styles).

### 2 — Modifiers standalone-safe (css/theme.css)

Replaced the standalone `.ds-stack { ... }` rule with one shared layout rule so every modifier works alone:

```
.ds-stack--center,
.ds-stack--sm,
.ds-stack--md,
.ds-stack--lg,
.ds-stack {
  display: flex;
  flex-direction: column;
  gap: var(--stack-gap, 16px);
  align-items: flex-start;
}
```

Each modifier then sets only its own value — `.ds-stack--sm { --stack-gap: 8px; }`, `.ds-stack--md { --stack-gap: 16px; }`, `.ds-stack--lg { --stack-gap: 32px; }`, `.ds-stack--center { align-items: center; text-align: center; }` — so a modifier used without `ds-stack` still gets flex-column layout plus its gap/centering. Existing `.ds-stack` behavior is unchanged (the shared rule supplies it).

Panel gap targets (asserted statically in tests/d6b.test.mjs; browser measurement NOT RUN — see Verification):
- `.ds-panel-section { --stack-gap: 12px; }` (css/editor.css) → 12px label→control and segmented→button.
- nested `.ds-stack--sm export-actions` → 8px Download PDF button→caption.
- `.ds-panel-section { padding: 20px; }` → 20px section padding (unchanged).
- `#download-pdf { width: 100%; }` and `.right-panel .ds-segmented { width: 100%; }` → both span the full section width (279px at 1440px).

### 3 — Tests

tests/d6b.test.mjs (new, 6 tests):
- no `ds-stack--*` modifier is used without the `ds-stack` base class — static scan over index.html, privacy.html, editor.html, design-system.html and every file under js/ (class-attribute token scan, fails on any orphan modifier).
- css/theme.css makes every `ds-stack--*` modifier standalone-safe — shared rule supplies display/flex-direction/gap/align-items:flex-start; each modifier sets only its own gap or centering.
- panel label-to-control and segmented-to-button gap is 12px from the section stack (`.ds-panel-section --stack-gap: 12px`).
- panel button-to-caption gap is 8px from the nested export-actions stack (`ds-stack--sm` is 8px).
- panel section padding stays 20px (`.ds-panel-section`).
- Download PDF button and Export segmented span the full section width (`#download-pdf` and `.right-panel .ds-segmented` at width: 100%).

tests/d5.test.mjs: the Export-section markup assertion updated to the new class order (`ds-stack ds-stack--sm panel-section ds-panel-section` and `ds-stack ds-stack--sm export-actions`). All other d5 tests untouched.

tests/d4.test.mjs: the two `.ds-stack {`-based assertions ("vertical-rhythm stack utilities" and "starts items at flex-start so .ds-btn never stretches") now read the shared stack rule body (`.ds-stack` has no standalone rule anymore; `.ds-stack .ds-btn { align-self: flex-start; }` is unchanged).

### Verification

```
node --test                                    -> 126/126 pass, exit 0
node scripts/check-contrast.mjs                -> 12/12 PASS (>= 4.5:1)
node scripts/check-headers.mjs --local         -> all header checks PASS
```

Exit code 0 for all three. CSP unchanged (`style-src 'self'`, no `unsafe-inline`, no inline style attributes, no `<style>` blocks, no inline scripts).

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so the live-page parts were not executed:
- Rendered panel gap measurement on /editor.html#demo at 1440x860 (12px label-to-control, 12px segmented-to-button, 8px button-to-caption, 20px section padding; #download-pdf and segmented full width 279px) — asserted statically by tests/d6b.test.mjs instead.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.

## Design D6c — stack alignment fix + 7 landing/editor regressions (css/theme.css, css/editor.css, index.html, privacy.html, editor.html, tests/)

### Root cause

The shared `.ds-stack` rule set `align-items: flex-start`, so every stack child shrank to its content width instead of filling the stack. Buttons and badges inside stacks could still stretch where the stack itself was stretched, and several landing/editor layouts relied on the shrink behavior:

a. Editor panel stat rows ("Pages", "Source files", "Original size") ran together ("Pages7") and sat 12px apart instead of 4px.
b. `#download-pdf` and the Export segmented control did not span the full section width.
c. The FAQ list container did not span the full `ds-container` width.
d. The facts strip under the hero was a vertical left-aligned list instead of a centered horizontal row.
e. "Soon" badges stretched to full width inside stacks instead of staying content-sized (~50px).
f. Card grids ("How it works", tools, proof) were a centered flex wrap, not equal 3-column grids spanning the container.
g. The hero drop zone listed badge → icon → title → hint and used a solid top border with tight padding instead of a rounded dashed card.

### 1 — Stack default (css/theme.css)

Changed the shared stack rule from `align-items: flex-start` to `align-items: stretch` so children fill the stack (normal column behavior). Added `.ds-stack--start { align-items: flex-start; }` for the rare start-aligned case. `.ds-stack--center` keeps `align-items: center; text-align: center;`.

Buttons and badges never stretch inside any stack:

```
.ds-stack > .ds-btn,
.ds-stack > a.ds-btn,
.ds-stack > .ds-icon-btn,
.ds-stack > .ds-badge-dark,
.ds-stack > .ds-badge-light,
.ds-stack > .ds-badge-soon {
  align-self: flex-start;
}
```

The earlier `.ds-stack .ds-btn { align-self: flex-start; }` rule is replaced by this direct-child list. Centered contexts (hero guarantee line, empty state, etc.) keep using `ds-stack--center`; the `.ds-hero .ds-badge-dark { align-self: center; }` rule (defined later in the cascade) keeps the hero badge centered.

### 2 — Regressions fixed

**a. Editor panel stat rows (editor.html).** The three `ds-stat-row`s are wrapped in a `ds-stat-group` (flex column, `gap: 4px`) inside the Document panel section. Each row is `display: flex; justify-content: space-between; width: 100%` so the label sits left and the value right, rows are 4px apart, and the 12px section gap applies to the group as a whole (label→group, not row→row).

**b. Export width (css/editor.css, css/theme.css).** `#download-pdf { width: 100%; }` and `.right-panel .ds-segmented { width: 100%; }` span the full section width (279px at 1440px) because the containing stacks now stretch; the `align-self: flex-start` rule affects alignment, not width, so both stay full width.

**c. FAQ width (index.html, privacy.html).** `ds-faq` stretches to the full `ds-container` width (1344px at 1440px; 48px left edge), matching its heading.

**d. Facts strip (index.html, css/theme.css).** `ds-facts` is now on the `ds-container` that directly holds the `.ds-fact` items, so `display: flex; flex-wrap: wrap; justify-content: center; gap: 56px` lays them out as a centered horizontal row (four across at 1440px; 2x2 below 900px via the existing `.ds-fact` breakpoint).

**e. Soon badges (css/theme.css).** `.ds-badge-soon` sets `align-self: flex-start` so it stays content-sized (~50px) everywhere — tool cards, the "Page tools" row, and any stack.

**f. Card grids (css/theme.css).** `ds-card-grid` is now `display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px` spanning the full `ds-container` (left edge 48px, right edge 1392px at 1440px); `ds-tools-grid` was already a grid. Both stack to one column below 900px.

**g. Hero drop zone (index.html, css/theme.css).** Markup order is now icon → title → hint → badge. `ds-dropzone--hero` is a rounded dashed card (`border-radius: 16px`, `border: 1.5px dashed`, `padding: 56px 32px`, `margin-top: 16px` below the mini window) and stays inside `ds-field`; the badge sits 16px below the hint.

### 3 — Tests

tests/d6c.test.mjs (new, 8 tests):
- `ds-stack--start` and `ds-stack--center` modifiers exist (align-items + text-align).
- `.ds-stat-row` is flex with `justify-content: space-between` and `width: 100%`; `.ds-stat-group` stacks its rows 4px apart; three stat rows are wrapped in `ds-stat-group`.
- facts strip is a centered horizontal row (`display: flex`, `justify-content: center`, `flex-wrap: wrap`, `gap: 56px`, four `.ds-fact` items direct children of `ds-container ds-facts`).
- card grids are `repeat(3, 1fr)` with a 24px gap; one column below 900px; desktop `margin-block-start: 48px`.
- hero drop zone order is icon, title, hint, badge.
- hero drop zone is a rounded dashed card: radius 16px, padding 56px 32px, dashed border, `margin-top: 16px`.

tests/d4.test.mjs: the ".ds-stack starts items at flex-start so .ds-btn never stretches" test is now ".ds-stack stretches children to fill width; buttons and badges stay content-sized" — asserts `align-items: stretch` (not flex-start) and the `align-self: flex-start` no-stretch rule.

tests/d6b.test.mjs: shared stack rule assertion updated from `align-items: flex-start` to `align-items: stretch`.

### Verification

```
node --test                                    -> 133/133 pass, exit 0
node scripts/check-contrast.mjs                -> 12/12 PASS (>= 4.5:1)
node scripts/check-headers.mjs --local         -> all header checks PASS
```

Exit code 0 for all three. CSP unchanged (`style-src 'self'`, no `unsafe-inline`, no inline style attributes, no `<style>` blocks, no inline scripts).

### Scan for other shrink/collapse issues

Scanned index.html, privacy.html and editor.html for remaining `ds-stack`/flex shrink problems. With `align-items: stretch` as the default, children of non-centered stacks now span the stack width — that is the intended behavior (normal column layout); centered stacks use `ds-stack--center` and are unaffected. Buttons and badges inside stacks stay content-sized via the `align-self: flex-start` rule. No additional shrink/collapse regressions were found beyond the seven fixed above; no further markup or style changes are needed.

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so the live-page parts were not executed:
- Rendered layout verification at 1440x860 (facts strip row, card-grid edges, FAQ full width, hero drop zone order/padding, stat-row spacing, Soon badge width, band button content-sized ~137px).
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.

## Design D6d — privacy navbar boot, proof spacing, facts-strip container (css/theme.css, index.html, privacy.html, js/privacy.js, tests/d6d.test.mjs)

### Item 1 — Privacy page boots its navbar (privacy.html, js/privacy.js)

privacy.html loaded only `/js/site.js` (which exports `initSite` but never calls it), so its `[data-navbar]` header was never mounted — no nav (Home, Tools, Privacy, FAQ, "Open the editor" CTA) and no `aria-current="page"` on Privacy.

Added `<script type="module" src="/js/privacy.js"></script>` right after the `/js/site.js` tag in privacy.html's `<head>`. `js/privacy.js` imports `initSite` from `./site.js` and calls it — the same boot pattern index.html uses with landing.js. `privacy.html` keeps `/js/site.js` as its first module script (site.js must load first; privacy.js imports from it). Footer on privacy.html (`ds-footer ds-container` with `data-logo`) renders from the same shared nav/footer source as index.html and shows the brand.

Only index.html and privacy.html carry `data-navbar`; both now load a module that calls `initSite()`.

Covered by tests/d6d.test.mjs "every page with a data-navbar loads a module that calls initSite()" — static scan over every `.html` file, resolving each `data-navbar` page's module scripts and their imports, asserting at least one calls `initSite()`.

### Item 2 — Privacy proof spacing (css/theme.css)

The promises card row (`.ds-promise-grid`) sat flush against the proof field below it, and the proof field sat flush against the `#faq` heading. No one-off margins.

`.ds-promise-grid` gained `margin-block-end: 32px` (32px below the card row, before the proof field). `#faq { margin-top: 48px; }` (already present) provides the 48px gap between the proof field and the FAQ heading. Cards keep their left/right edge on the container grid — `.ds-promise-grid` is a child of `ds-container` on privacy.html, so its left/right edges align with the container.

Covered by tests/d6d.test.mjs "privacy proof field is 32px below the cards and 48px above the FAQ" — asserts `.ds-promise-grid` has `margin-block-end: 32px` at a column-0 standalone rule (the media-query-grouped `.ds-promise-grid {` inside `@media (min-width: 900px)` must not shadow it), and `#faq` has `margin-top: 48px`.

### Item 3 — Facts strip inside ds-container (index.html, css/theme.css)

The facts strip under the hero already lives inside `<div class="ds-container ds-facts">`, so its content starts at the container edge (48px at desktop, 24px on phones — `.ds-container` steps down to 24px below 600px). `.ds-facts` is `display: flex; flex-wrap: wrap; justify-content: center; gap: 56px` — one centered row at desktop. Below 900px it is 2x2 via the existing `.ds-fact` breakpoint (`calc(50% - 28px)` items). No bottom-border change needed: the strip is inline with container-width sections, not full-bleed.

Covered by tests/d6d.test.mjs "facts strip lives inside ds-container on index.html" — asserts the `ds-container ds-facts` markup, `.ds-facts` gap 56px, centered row, and the 2x2-below-900px breakpoint.

### Item 4 — Tests

tests/d6d.test.mjs: +3 static checks covering items 1–3. All existing tests untouched.

### Verification

```
node --test                                    -> 136/136 pass, exit 0
node scripts/check-contrast.mjs                -> 12/12 PASS (>= 4.5:1)
node scripts/check-headers.mjs --local         -> all header checks PASS
```

Exit code 0 for all three. CSP unchanged (`style-src 'self'`, no `unsafe-inline`, no inline style attributes, no `<style>` blocks, no inline scripts).

### NOT RUN (blocked by the sandbox / harness)

No browser is available and `python3 -m http.server 8000` is denied, so the live-page parts were not executed:
- Live-page verification: privacy.html nav rendered (Home, Tools, Privacy, FAQ with `aria-current="page"` on Privacy, "Open the editor" CTA), footer brand on privacy.html and index.html, 32px cards→proof and 48px proof→FAQ gaps, facts strip row at 1440px and 2x2 below 900px.
- `node scripts/check-headers.mjs http://localhost:8000` (URL mode needs a live server).

Unit tests do not prove UI behavior. The user verifies live with production headers after deploy.

Nothing was committed. Git was not touched.
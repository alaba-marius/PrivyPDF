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

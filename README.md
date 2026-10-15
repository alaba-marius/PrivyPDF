<div align="center">
  <img src="assets/privypdf-logo.png" alt="PrivyPDF" width="480" />
  <h3>Private PDF editing, right in your browser.</h3>
  <p>Organize pages, update supported text, and add annotations. Your files stay on your device.</p>
  <p><strong>Static site · No build step · No uploads</strong></p>
  <p>
    <a href="https://privy-pdf.vercel.app/"><img src="https://img.shields.io/badge/Live%20Site-privy--pdf.vercel.app-black?logo=vercel" alt="Live site: privy-pdf.vercel.app" /></a>
  </p>
  <p><a href="https://privy-pdf.vercel.app/"><strong>🔗 Try PrivyPDF live → privy-pdf.vercel.app</strong></a></p>
  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white" alt="HTML5" />
    <img src="https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white" alt="CSS3" />
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript" />
    <img src="https://img.shields.io/badge/PDF.js-6.4.299-red" alt="PDF.js 6.4.299" />
    <img src="https://img.shields.io/badge/pdf--lib-1.17.1-blue" alt="pdf-lib 1.17.1" />
    <img src="https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white" alt="Vercel" />
    <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker" />
  </p>
</div>

## Tech stack

- **HTML5 and CSS3** — static pages (`index.html`, `editor.html`, `privacy.html`) styled with a shared stylesheet.
- **Native JavaScript (ES modules)** — all app logic, with no framework and no build step.
- **[PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist` 6.4.299)** — renders PDF pages and reads existing text in the browser.
- **[pdf-lib](https://pdf-lib.js.org/) 1.17.1** — builds and exports the edited PDF on-device.
- **Self-hosted fonts and libraries** — everything is vendored locally, with no third-party CDN.
- **Vercel** — hosts the official site at [privy-pdf.vercel.app](https://privy-pdf.vercel.app/), with security headers from `_headers`.
- **Docker (optional)** — a small nginx image that serves the static site, published to GitHub Container Registry.

## Highlights

- **Keep files local** — PDFs are opened, edited, and exported in your browser.
- **Organize pages** — rotate, reorder, duplicate, delete, insert, and extract pages.
- **Edit and annotate** — Annotate mode offers Drag, Add text with font and style options, Add image, Draw, and Add shape. Tool options open in a contextual horizontal toolbar beneath the main toolbar. In Edit mode, drag-select PDF text to apply Highlight, Underline, Squiggly underline, or Strikethrough precisely to the selected portion; a simple click does not mark the whole text run. Free Text replaces Comment and adds font styling, alignment, dynamic sizing, and text outline controls. Annotation settings are preserved in the downloaded PDF. Shapes provides per-shape Stroke and Fill palettes, opacity, stroke width, line styles, endpoint markers, and freehand Polyline drawing, alongside Undo, Redo, and Eraser. Insert includes a browsable stamp gallery and session-local saved signatures that can be drawn, typed, or uploaded, as well as image and attachment insertion. Forms provides signature, free-text, text-field, checkbox, radio, dropdown, and list-box tools with field-specific defaults, editable choice lists, a field color picker, and a dedicated field list. Form widgets and free text can be moved and resized with selection handles; free text also supports copy, color, link, and delete actions.
- **Fill table cells** — type in empty cells when the PDF has a detectable drawn table grid.
- **Re-edit and move text boxes** — click an added text box to edit it again; use Edit mode to move it.
- **Work with PDFs and images** — open PDF, JPG, and PNG files in one workspace.
- **Undo and redo** — recover from page and annotation changes.
- **Save or download** — Save changes keeps edits marked as saved in the current editor session; Download builds and saves the edited PDF locally.

## Get started

### Which option should I pick?

| If you... | Use this |
| --- | --- |
| Just want to edit a PDF | [**Option 1: Use the website**](#option-1-use-the-website-easiest) |
| Want a private copy on your own computer and are comfortable installing programs | [**Option 2: Docker**](#option-2-run-it-with-docker) |
| Already have Python or Node.js | [**Option 3: Run from source**](#option-3-run-it-from-source) |

If you are not sure, choose **Option 1**. It needs no installation, and your files still stay on your device.

---

### Option 1: Use the website (easiest)

1. Open **[privy-pdf.vercel.app](https://privy-pdf.vercel.app/)** in your browser.
2. Click **Open editor**.
3. Open a PDF, edit it, and click **Download** when you are done.

That is all. There is nothing to install, no account, and no upload. Your PDF is processed inside your own browser and never sent to a server.

---

### Option 2: Run it with Docker

Docker lets you run PrivyPDF on your own computer with a single command, without downloading the source code.

> **What is Docker?** It is a free program that runs ready-made apps in a sealed box called a *container*. You install Docker once, then start PrivyPDF with one line.

#### If you already have Docker

```bash
docker run -p 8080:80 ghcr.io/alaba-marius/privypdf
```

Then open [http://localhost:8080](http://localhost:8080) in your browser and click **Open editor**.

To stop it, press `Ctrl + C` in the terminal window.

If port 8080 is already in use, pick another number on the left, for example `-p 9090:80`, and open `http://localhost:9090` instead.

#### If you do not have Docker (step-by-step for beginners)

You only need to do steps 1 to 3 once.

**Step 1: Install Docker Desktop**

1. Go to [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
2. Download the version for your computer (Windows, Mac, or Linux).
3. Open the file you downloaded and follow the installer.
   - **Windows:** if it asks to enable **WSL 2**, say yes. Restart your computer if it asks you to.
   - **Mac:** drag Docker into the Applications folder when prompted. Choose the **Apple Silicon** version for newer Macs (M1, M2, M3, M4), or **Intel** for older ones.

**Step 2: Start Docker Desktop**

1. Open **Docker Desktop** from your Start menu (Windows) or Applications folder (Mac).
2. Accept the terms if it asks. You can skip signing in.
3. Wait until the bottom-left corner shows that Docker is running (a green indicator or "Engine running"). This can take a minute the first time.

Docker must be open and running every time you use PrivyPDF this way.

**Step 3: Open a terminal**

- **Windows:** press the Windows key, type `cmd`, and press Enter.
- **Mac:** press `Cmd + Space`, type `Terminal`, and press Enter.

**Step 4: Start PrivyPDF**

Copy this line, paste it into the terminal window, and press Enter:

```bash
docker run -p 8080:80 ghcr.io/alaba-marius/privypdf
```

The first time, Docker downloads the app, which may take a short while. When the text stops scrolling, it is ready.

**Step 5: Open the app**

Open your browser and go to **[http://localhost:8080](http://localhost:8080)**, then click **Open editor**.

**Step 6: Stop it when you are done**

Click the terminal window and press `Ctrl + C`. You can then close Docker Desktop.

To use PrivyPDF again later, open Docker Desktop, wait for it to start, and repeat Steps 3 to 5. You do not need to reinstall anything.

#### Troubleshooting

| Problem | What to do |
| --- | --- |
| `'docker' is not recognized` or `command not found` | Docker Desktop is not installed yet, or you have not restarted your computer after installing. Install it (Step 1), restart, then try again. |
| `Cannot connect to the Docker daemon` or similar | Docker Desktop is not running. Open it and wait until it says it is running. |
| `port is already allocated` | Something else is using port 8080. Use a different number, for example `docker run -p 9090:80 ghcr.io/alaba-marius/privypdf`, then open `http://localhost:9090`. |
| The page does not load | Make sure the terminal window is still open and the command is still running. |
| Installation feels like too much | Use [Option 1](#option-1-use-the-website-easiest). It does the same thing with nothing to install. |

#### Is it still private?

Yes. The Docker container only hands your browser the app's code. Your PDF is opened and edited inside your browser, exactly like on the live site, and is never sent to the container or anywhere else. You can check this yourself: open your browser's developer tools (press `F12`), go to the **Network** tab, load a PDF, and confirm that no upload requests appear. See [`privacy.html`](./privacy.html) for more.

---

### Option 3: Run it from source

PrivyPDF is a static site. You need to serve the folder over HTTP; opening an HTML file directly with `file://` can prevent JavaScript modules and PDF.js workers from loading.

**1. Get the code**

```bash
git clone https://github.com/alaba-marius/PrivyPDF.git
cd PrivyPDF
```

No Git? On GitHub, click **Code → Download ZIP**, unzip it, and open a terminal inside the extracted folder. On Windows, you can open the folder in File Explorer, click the address bar, type `cmd`, and press Enter.

**2. Start a local server** (use whichever you have installed)

```bash
# Python 3 (macOS/Linux)
python3 -m http.server 8000

# Python 3 (Windows)
python -m http.server 8000
# or: py -m http.server 8000

# Node.js
npx serve -l 8000
```

**3. Open the app**

Go to [http://localhost:8000](http://localhost:8000) and choose **Open editor**.

Press `Ctrl + C` in the terminal to stop the server. If port 8000 is already in use, pick another number (for example `8080`) and use it in the URL.

> Run the command from the project root, the folder that contains `index.html`.

## Editing existing PDF text

The Select tool is context-sensitive: dashed outlines identify detected PDF text; click supported text to edit it in place, drag it to move it, or click an empty cell in a detectable table to fill it. Existing text edits preserve the original line advance when exporting. The preview samples nearby page colors to better match the page background and text color.

Use the separate **Add text** tool to place text in blank page space. Clicking an existing added text box edits it instead of creating another one. Use **Select and edit text** to move an added text box by dragging it.

When a PDF contains a clear, drawn table grid, the Select tool can detect its cells. Click existing text to edit it, or click an empty cell to add text there. Empty-cell text is a regular text overlay; PDFs without a detectable grid keep the existing text-editing behavior.

Current support covers simple `Tj` and `TJ` text runs, standard-encoded Type1/TrueType fonts with printable ASCII replacements, simple fonts with a single-byte ToUnicode map and width table, and horizontal Identity-H composite fonts with a usable ToUnicode map and CID widths. ToUnicode-based replacements must have an unambiguous character mapping in the source font. Unsupported fonts, characters, or text runs report an export error rather than silently substituting text.

For other content, add a text annotation instead. Text overlays use standard Helvetica fonts; some non-Latin text may need a future embedded-font workflow. Visual cover-and-replace is disabled because it did not securely remove original PDF content.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Landing page |
| `editor.html` | PDF editor |
| `privacy.html` | Privacy model and verification guidance |
| `css/main.css` | Shared styles and editor/landing-page layout |
| `js/` | Native JavaScript modules |
| `assets/` | Brand logo and icon |
| `vendor/` | Self-hosted PDF.js, pdf-lib, fonts, and PDF.js resources |
| `tests/` | Sample PDFs and manual smoke-test instructions |
| `_headers` | Security headers for compatible static hosts |
| `Dockerfile` | Builds the nginx image that serves the static site |
| `.dockerignore` | Files excluded from the Docker image |
| `.github/workflows/docker.yml` | Builds and publishes the Docker image to GitHub Container Registry |

## Privacy and dependencies

PDF processing runs in the browser. The project uses self-hosted PDF.js (`pdfjs-dist` 6.4.299), pdf-lib 1.17.1, and local fonts; it requires no third-party CDN or build step. Each HTML page applies a Content Security Policy, and `_headers` provides additional security headers on supported static hosts. The optional Docker image only serves these static files; it does not receive or process your PDFs.

Keep the upstream notices when updating vendored files: `vendor/pdfjs/LICENSE`, `vendor/pdf-lib/LICENSE.md`, and `vendor/fonts/OFL.txt`. PDF.js subcomponent notices are kept with their resources.

## Manual checks

Open `tests/sample.pdf` and verify page rotation, duplication, reordering, deletion, undo/redo, extraction, and download. Open `tests/text-sample.pdf` to test text selection and editing, text insertion and re-editing, text-box movement, table-cell entry where a detectable grid is present, text formatting, image and shape insertion, annotation layer ordering, highlighting, drawing, erasing, and tool toggling. Verify Save changes does not download and Download does. The full scenarios and expected results are in [`tests/README.md`](./tests/README.md).

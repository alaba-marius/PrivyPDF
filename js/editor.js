// Editor shell: store, file loading, page actions, export and the wiring
// between the grid, the panels and the keyboard. All page mutations go
// through the store; the grid and panels are pure views over it.
import { hydrateIcons } from "./icons.js";
import { takeFiles, pickFiles, validateFiles, downloadBytes, baseName } from "./file-manager.js";
import { toast } from "./toast.js";
import { createStore } from "./core/store.js";
import { installErrorHandler, setToast } from "./core/errors.js";
import { startPrivacyMeter, subscribe as subscribeMeter } from "./core/privacy-meter.js";
import { registerShortcuts } from "./core/shortcuts.js";
import {
  toggleSelection,
  selectAll,
  selectRange,
  rotateSelected as rotatePages,
  duplicateSelected as duplicatePages,
  deleteSelected as deletePages,
  moveSelected,
} from "./core/pages.js";
import { createSourceLoader } from "./core/source-loader.js";
import { createExporter } from "./core/exporter.js";
import { extractFileName } from "./core/extract-name.js";
import { fitSize } from "./core/card-view.js";
import { createSource, getSource, removeSource, totalBytes } from "./core/sources.js";
import { mountDropzone } from "./ui/dropzone.js";
import { mountGrid, buildSkeletons } from "./ui/cards.js";
import { mountPanel } from "./ui/panel.js";
import { mountSubToolbar, mountFloatBar } from "./ui/toolbar.js";
import { mountDrawer } from "./ui/drawer.js";

installErrorHandler();
setToast(toast);

const $ = (id) => document.getElementById(id);

// Local UI focus state (not history-worthy, so it lives outside the store).
let focusedId = null;
let anchorId = null;
let nextId = 1;

// Lazy pdf.js: imported as a module the first time a real PDF is opened; the
// worker is the same-origin vendored worker bundle, allowed by the CSP.
let pdfjsLib;
let pdfjsReady;
async function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = import("/vendor/pdfjs/pdf.min.js").then((mod) => {
      pdfjsLib = mod;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
    });
  }
  await pdfjsReady;
}

const sourceLoader = createSourceLoader({
  loadPdf: async (bytes) => {
    await loadPdfJs();
    const task = pdfjsLib.getDocument({
      data: bytes.slice(), // pass a copy; the caller keeps its own bytes
      workerSrc: "/vendor/pdfjs/pdf.worker.min.js",
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
      wasmUrl: "/vendor/pdfjs/wasm/",
      isEvalSupported: false,
      enableXfa: false,
    });
    return task.promise;
  },
  decodeImage: async (bytes, type) =>
    createImageBitmap(new Blob([bytes], { type })),
});

// pdf-lib is injected in tests; in the browser it is dynamically imported
// from the vendored bundle the first time someone exports.
const exporter = createExporter();

const store = createStore(
  {
    mode: "empty",
    fileName: "No document",
    pages: [],
    selected: [],
    sourceFiles: [],
    totalSize: 0,
    size: "large",
    exportMode: "all",
  },
  { track: ["pages"] },
);

function recomputeNextPageCounter() {
  let max = 0;
  for (const page of store.get().pages) {
    const n = Number(String(page.id).slice(1));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  nextId = max + 1;
}

function getState() {
  return { ...store.get(), focusedId };
}

function announceStatus(message) {
  const el = $("sub-status");
  const previous = el.textContent;
  el.textContent = message;
  setTimeout(() => {
    if (el.textContent === message) el.textContent = previous;
  }, 1500);
}

function announceMove() {
  const state = getState();
  const position = state.pages.findIndex((page) => page.id === focusedId) + 1;
  announceStatus(`Page moved to position ${position} of ${state.pages.length}`);
}

function renderAll() {
  const state = getState();

  // Keep roving focus and the range anchor on pages that still exist.
  const ids = new Set(state.pages.map((page) => page.id));
  if (focusedId != null && !ids.has(focusedId)) {
    focusedId = state.pages[0]?.id ?? null;
  }
  if (anchorId != null && !ids.has(anchorId)) {
    anchorId = focusedId ?? null;
  }

  $("file-name").textContent = state.fileName;

  $("empty-state").hidden = state.mode !== "empty";
  $("loading-state").hidden = state.mode !== "loading";
  $("page-grid").hidden = state.mode !== "loaded";

  gridCtl.render();

  const count = state.selected.length;
  floatBar.label(count);
  floatBar.setHidden(count === 0);

  // Below 480px the sub-toolbar holds Select all, Undo and Redo side by side,
  // so drop the "N pages" part and keep only "N selected".
  const pageStatus = mq480.matches ? `${count} selected` : `${state.pages.length} pages · ${count} selected`;
  $("sub-status").textContent =
    state.mode === "loading"
      ? "Loading…"
      : state.mode === "loaded"
        ? `${state.pages.length} pages · ${count} selected`
        : pageStatus;

  subToolbar.setSize(state.size);
  panel.render(state);

  const hasPages = state.pages.length > 0;

  $("btn-download").disabled = !hasPages;
  $("download-pdf").disabled = !hasPages;
  $("select-all").disabled = !hasPages;
  $("export-all").disabled = !hasPages;
  $("export-selected").disabled = !hasPages;
  $("btn-undo").disabled = !hasPages || !store.canUndo();
  $("btn-redo").disabled = !hasPages || !store.canRedo();

  // Actions triggered outside the grid (top bar, float bar, panel, shortcuts,
  // undo/redo) don't land focus on a card, so move it to the focused page so
  // arrow keys keep working. Never yank focus away from an open input.
  if (state.focusedId != null && document.activeElement !== $("doc-name")) {
    const focusEl = $("page-grid").querySelector(`[data-id="${state.focusedId}"]`);
    if (focusEl && focusEl !== document.activeElement) focusEl.focus();
  }
}

// ---------- File handling ----------

async function handleFiles(fileList) {
  store.patch({ mode: "loading" });
  const { valid, rejected } = await validateFiles(fileList);
  rejected.forEach(({ file, reason }) => {
    toast(`${baseName(file.name)}: ${reason}`, { type: "error" });
  });
  recomputeNextPageCounter();

  const addedPages = [];
  const addedSourceFiles = [];
  for (const file of valid) {
    try {
      const loaded = await sourceLoader.loadFile(file);
      const source = createSource({
        kind: loaded.kind,
        bytes: loaded.bytes,
        size: loaded.size,
        type: file.type,
        pageCount: loaded.pageCount,
        pdfjsDoc: loaded.pdfjsDoc,
        imageBitmap: loaded.imageBitmap,
        width: loaded.width,
        height: loaded.height,
      });
      for (const page of loaded.pages) {
        addedPages.push({
          id: `p${nextId++}`,
          sourceId: source.id,
          index: page.index,
          baseRotation: page.baseRotation,
          rotated: 0,
          width: page.width,
          height: page.height,
        });
      }
      addedSourceFiles.push({
        id: source.id,
        name: file.name,
        size: file.size,
        type: file.type,
        pages: loaded.pageCount,
      });
    } catch (error) {
      const message = String(error.message || error);
      const name = baseName(file.name);
      if (/password|encrypt/i.test(message)) {
        toast(`${name} is password protected — password-encrypted PDFs are not supported yet.`, {
          type: "error",
        });
      } else {
        // Log the underlying reason (never file contents) and show a generic
        // message so a corrupt or unsupported file doesn't leak internals.
        console.warn(`${name}: ${message}`);
        toast(`${name} could not be opened.`, { type: "error" });
      }
    }
  }

  const state = getState();
  const pages = [...state.pages, ...addedPages];
  // Adding another file never replaces an already shown file name.
  let fileName = state.fileName;
  if (fileName === "No document" && addedSourceFiles.length) {
    fileName =
      addedSourceFiles.length === 1
        ? addedSourceFiles[0].name
        : `${addedSourceFiles.length} files`;
  }
  store.patch({
    mode: pages.length ? "loaded" : "empty",
    fileName,
    sourceFiles: [...state.sourceFiles, ...addedSourceFiles],
    totalSize: totalBytes(),
    pages,
    selected: [],
  });
  focusedId = pages[0]?.id ?? null;
  anchorId = null;
}

// ---------- Selection ----------

function togglePage(id) {
  // Non-shift click and Space/Enter: focus and anchor land on this card.
  focusedId = id;
  anchorId = id;
  store.patch({ selected: toggleSelection(store.get().selected, id) });
}

function selectAllPages() {
  const state = getState();
  if (state.pages.length && state.selected.length === state.pages.length) {
    store.patch({ selected: [] });
  } else {
    store.patch({ selected: selectAll(state.pages) });
  }
}

function selectNone() {
  store.patch({ selected: [] });
}

function selectRangeTo(to) {
  const state = getState();
  focusedId = state.pages[to]?.id ?? null;
  store.patch({ selected: selectRange(state.pages, anchorId, to) });
}

// ---------- Page actions (each checkpoint is one undo step) ----------

function rotateSelected() {
  const state = getState();
  store.checkpoint((s) => {
    s.pages = rotatePages(s.pages, state.selected);
  });
}

function duplicateSelected() {
  const state = getState();
  const { pages, dupes, nextId: newNextId } = duplicatePages(state.pages, state.selected, nextId);
  nextId = newNextId;
  focusedId = dupes[0]?.id ?? null;
  store.checkpoint((s) => {
    s.pages = pages;
    s.selected = dupes.map((page) => page.id);
  });
}

function deleteSelected() {
  const state = getState();
  const focusedIdx = state.pages.findIndex((page) => page.id === state.focusedId);
  store.checkpoint((s) => {
    s.pages = deletePages(s.pages, state.selected);
    s.selected = [];
  });
  // If the focused page was deleted, focus the page that took its place (the
  // one after it), falling back to the page before it when it was the last
  // page, then the first remaining page. Otherwise keep focus where it is.
  const after = getState();
  if (after.pages.length === 0) {
    focusedId = null;
  } else if (
    state.focusedId != null &&
    after.pages.some((page) => page.id === state.focusedId)
  ) {
    // focused page survived
  } else {
    focusedId = (after.pages[focusedIdx] ?? after.pages[focusedIdx - 1] ?? after.pages[0]).id;
  }
  renderAll();
}

function removeSourceFile(sourceId) {
  const state = getState();
  store.checkpoint((s) => {
    s.pages = s.pages.filter((page) => page.sourceId !== sourceId);
    s.sourceFiles = s.sourceFiles.filter((file) => file.id !== sourceId);
    s.totalSize = totalBytes();
    if (s.pages.length === 0) {
      s.mode = "empty";
      s.fileName = "No document";
      s.selected = [];
    }
  });
  removeSource(sourceId);
  if (getState().pages.length === 0) {
    focusedId = null;
  } else if (!getState().pages.some((page) => page.id === state.focusedId)) {
    focusedId = getState().pages[0].id;
  }
}

function moveBlock(toIndex) {
  const state = getState();
  const sel = new Set(state.selected);
  const moved =
    state.selected.length
      ? state.pages.filter((page) => sel.has(page.id))
      : state.focusedId != null
        ? state.pages.filter((page) => page.id === state.focusedId)
        : [];
  if (!moved.length) return;
  store.checkpoint((s) => {
    s.pages = moveSelected(s.pages, moved.map((page) => page.id), state.focusedId, toIndex);
  });
  focusedId = moved[0].id;
  announceMove();
}

// Pointer-drag or Alt+Arrow reordering of the selected block (or the focused
// page when nothing is selected).
function movePagesBy(dir) {
  const state = getState();
  const sel = new Set(state.selected);
  const moved =
    state.selected.length
      ? state.pages.filter((page) => sel.has(page.id))
      : state.focusedId != null
        ? state.pages.filter((page) => page.id === state.focusedId)
        : [];
  if (!moved.length) return;
  const blockStart = state.pages.findIndex((page) => page.id === moved[0].id);
  moveBlock(dir > 0 ? blockStart + 1 : blockStart - 1);
}

// ---------- Export ----------

async function exportDocument(mode) {
  const state = getState();
  if (!state.pages.length) return;
  if (mode === "selected" && !state.selected.length) {
    toast("Select pages first.", { type: "error" });
    return;
  }
  try {
    const { name, bytes } = await exporter.exportPages({
      pages: state.pages,
      getSource,
      fileName: state.fileName,
      exportMode: mode,
      selected: new Set(state.selected),
    });
    await downloadBytes(name, bytes);
  } catch (error) {
    toast(`Export failed: ${error.message}`, { type: "error" });
  }
}

// Download the selected pages as their own PDF, in the current order, without
// touching the document, the selection or the undo history. The file name is
// "<doc name>-pages-<ranges>.pdf" with the positions compressed ("3-5,9").
async function extractSelected() {
  const state = getState();
  if (!state.selected.length) {
    toast("Select the pages to extract first.", { type: "error" });
    return;
  }
  const positions = state.pages
    .map((page, index) => index + 1)
    .filter((_, index) => state.selected.has(state.pages[index].id));
  try {
    const { name, bytes } = await exporter.exportPages({
      pages: state.pages,
      getSource,
      fileName: extractFileName(state.fileName, positions),
      exportMode: "selected",
      selected: new Set(state.selected),
    });
    await downloadBytes(name, bytes);
  } catch (error) {
    toast(`Export failed: ${error.message}`, { type: "error" });
  }
}

// ---------- Wiring ----------

const gridCtl = mountGrid($("page-grid"), $("add-tile"), $("workarea"), {
  getState,
  getSourceName: (id) => {
    const file = getState().sourceFiles.find((f) => f.id === id);
    return file ? file.name : "";
  },
  onToggle: togglePage,
  onFocus: (id) => {
    // Only update focusedId; the grid updates roving tabindex in place and
    // never rebuilds DOM here, so a card clicked between mousedown and mouseup
    // keeps its click.
    focusedId = id;
  },
  onSelectAll: selectAllPages,
  onSelectNone: selectNone,
  onSelectRange: selectRangeTo,
  onFocusNext: (index) => {
    focusedId = getState().pages[index].id;
    anchorId = focusedId;
    renderAll();
  },
  onSizeChange: (size) => store.patch({ size }),
  onAdd: () => {
    pickFiles().then(handleFiles);
  },
  onMoveTo: (toIndex) => moveBlock(toIndex),
  renderThumbnail: async (key, signal) => {
    const [sourceId, indexSpec, sizeSpec] = key.split(":");
    const [dw, dh] = sizeSpec.split("x").map(Number);
    const source = getSource(sourceId);
    if (!source) throw new Error("source gone");

    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
    let naturalW, naturalH;
    if (source.kind === "pdf") {
      const pdfPage = await source.pdfjsDoc.getPage(Number(indexSpec) + 1);
      if (signal.aborted) {
        pdfPage.cleanup();
        throw new Error("aborted");
      }
      const baseViewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
      naturalW = baseViewport.width;
      naturalH = baseViewport.height;
    } else {
      naturalW = source.width;
      naturalH = source.height;
    }

    // Fit the page into the sheet content box without stretching; the bitmap
    // is rendered at exactly that size times devicePixelRatio (capped at 2).
    const { width: renderW, height: renderH } = fitSize(naturalW, naturalH, dw, dh);
    const scale = renderW / naturalW;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(renderW * dpr));
    canvas.height = Math.max(1, Math.round(renderH * dpr));
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    if (source.kind === "pdf") {
      const pdfPage = await source.pdfjsDoc.getPage(Number(indexSpec) + 1);
      if (signal.aborted) {
        pdfPage.cleanup();
        throw new Error("aborted");
      }
      const viewport = pdfPage.getViewport({ scale, rotation: 0 });
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      pdfPage.cleanup();
    } else {
      ctx.drawImage(source.imageBitmap, 0, 0, naturalW, naturalH, 0, 0, renderW, renderH);
    }

    const bitmap = await createImageBitmap(canvas);
    return { bitmap };
  },
});

const subToolbar = mountSubToolbar($("sub-toolbar"), {
  onSelectAll: selectAllPages,
  onSizeChange: (size) => store.patch({ size }),
});

// Top bar.
mountDropzone($("empty-drop"), handleFiles);

$("add-files").addEventListener("click", () => {
  pickFiles().then(handleFiles);
});
$("btn-undo").addEventListener("click", () => {
  store.undo();
});
$("btn-redo").addEventListener("click", () => {
  store.redo();
});
$("btn-download").addEventListener("click", () => {
  exportDocument("all");
});

// Pin the rail scroll to 0 on load so the overflowing tab row never clips
// its first item (Pages).
$("rail").scrollLeft = 0;

// Below 480px the top bar cannot hold five 44px buttons (Add files, Undo,
// Redo, Download, Details), so Undo/Redo move into the sub-toolbar. The
// elements are moved (not copied), so their listeners stay attached and no
// id is duplicated.
const mq480 = matchMedia("(max-width: 479px)");
const topRight = document.querySelector(".top-right");
const subRight = document.querySelector(".sub-right");
function placeUndoRedo() {
  if (mq480.matches) {
    if (subRight && $("btn-undo").parentElement !== subRight) {
      subRight.append($("btn-undo"), $("btn-redo"));
    }
  } else if (topRight && $("btn-undo").parentElement !== topRight) {
    topRight.append($("btn-undo"), $("btn-redo"));
  }
}
mq480.addEventListener("change", placeUndoRedo);
placeUndoRedo();

// Rail. Merge appends the chosen PDFs' pages after the current pages; Images
// appends each chosen image as a page. Both go through the normal loading
// pipeline (validation, toasts). The Pages rail item stays active.
$("rail-merge").addEventListener("click", () => {
  pickFiles({ accept: "application/pdf,.pdf" }).then(handleFiles);
});
$("rail-images").addEventListener("click", () => {
  pickFiles({ accept: "image/jpeg,image/png,.jpg,.jpeg,.png" }).then(handleFiles);
});
$("rail-extract").addEventListener("click", extractSelected);

// Float bar.
const floatBar = mountFloatBar($("float-bar"), {
  onRotate: rotateSelected,
  onDuplicate: duplicateSelected,
  onExtract: extractSelected,
  onDelete: deleteSelected,
});

// Right panel.
const panel = mountPanel($("right-panel"), {
  onFileNameChange: (name) => store.patch({ fileName: name.replace(/\.pdf$/i, "") + ".pdf" }),
  onExportModeChange: (mode) => {
    if (mode === "selected" && !getState().selected.length) {
      toast("Select pages first.", { type: "error" });
      return;
    }
    store.patch({ exportMode: mode });
  },
  onDownloadPDF: () => exportDocument(getState().exportMode),
  onSourceRemove: (sourceId) => removeSourceFile(sourceId),
});

// Drawer panel (narrow viewports).
const drawer = mountDrawer($("top-details"), $("right-panel"), $("drawer-scrim"));

// Page-wide drag overlay.
const overlay = $("drag-overlay");
window.addEventListener("dragenter", (event) => {
  if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
  event.preventDefault();
  overlay.classList.add("is-visible");
});
window.addEventListener("dragover", (event) => {
  if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
  event.preventDefault();
});
window.addEventListener("dragleave", () => {
  overlay.classList.remove("is-visible");
});
window.addEventListener("drop", (event) => {
  if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
  event.preventDefault();
  overlay.classList.remove("is-visible");
  handleFiles([...event.dataTransfer.files]);
});

// Shortcuts (ignored while typing in inputs).
registerShortcuts({
  onRotate: rotateSelected,
  onDuplicate: duplicateSelected,
  onDelete: deleteSelected,
  onUndo: () => {
    store.undo();
  },
  onRedo: () => {
    store.redo();
  },
  onDownload: () => {
    exportDocument(getState().exportMode);
  },
});

// Alt+Left / Alt+Right move the selected block (or the focused page) one
// position left or right. Announced through the aria-live status region.
function isTypingTarget(target) {
  return (
    target &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  if (!event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    movePagesBy(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    movePagesBy(1);
  }
});

// Privacy meter: live counter of requests to other origins.
startPrivacyMeter();
subscribeMeter((n) => {
  $("privacy-count").textContent = n;
});

// Branding + icons.
document.querySelectorAll("[data-logo]").forEach((el) => {
  el.innerHTML =
    '<span class="footer-brand-mark" aria-hidden="true"><i data-icon="file-text"></i></span>' +
    '<span class="footer-brand-name">Privy<span>PDF</span></span>';
});
hydrateIcons(document);

// Handoff from the landing page: files stashed in IndexedDB (folio-local /
// handoff / "pending") are taken once and deleted from the browser. A storage
// error never breaks the page, and no file names or contents are logged.
void (async () => {
  try {
    const stashed = await takeFiles();
    if (stashed.length) await handleFiles(stashed);
  } catch {
    // IndexedDB unavailable or empty: nothing to resume.
  }
})();

// Initial render: build skeletons, then subscribe (which renders immediately).
buildSkeletons(7, $("skeleton-grid"));
store.subscribe(renderAll);

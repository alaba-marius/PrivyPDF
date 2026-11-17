import { hydrateIcons } from "./icons.js";
import { takeFiles, pickFiles, validateFiles, baseName } from "./file-manager.js";
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
} from "./core/pages.js";
import { mountDropzone } from "./ui/dropzone.js";
import { mountGrid, buildSkeletons } from "./ui/cards.js";
import { mountPanel } from "./ui/panel.js";
import { mountSubToolbar, mountFloatBar } from "./ui/toolbar.js";
import { mountDrawer } from "./ui/drawer.js";

installErrorHandler();
setToast(toast);

const $ = (id) => document.getElementById(id);
const DEMO = location.hash === "#demo";

// Local UI focus state (not history-worthy, so it lives outside the store).
let focusedId = null;

const store = createStore(
  {
    mode: DEMO ? "demo" : "empty",
    fileName: DEMO ? "Annual-report.pdf" : "No document",
    pages: DEMO
      ? Array.from({ length: 7 }, (_, id) => ({ id: `p${id + 1}`, rotated: 0 }))
      : [],
    selected: DEMO ? ["p3", "p4"] : [],
    sourceFiles: [],
    totalSize: 0,
    size: "large",
    exportMode: "all",
  },
  { track: ["pages"] },
);

let nextId = store.get().pages.length + 1;
focusedId = store.get().pages[0]?.id ?? null;
let anchorId = null;

function getState() {
  return { ...store.get(), focusedId };
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
  $("page-grid").hidden = state.mode !== "demo" && state.mode !== "loaded";
  $("info-card").hidden = state.mode !== "loaded";

  gridCtl.render();

  const count = state.selected.length;
  floatBar.label(count);
  floatBar.setHidden(count === 0);

  $("sub-status").textContent =
    state.mode === "loading"
      ? "Loading…"
      : state.mode === "demo"
        ? `${state.pages.length} pages · ${count} selected`
        : state.mode === "loaded"
          ? `${state.sourceFiles.length} file(s) loaded`
          : "No document";

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
}

// ---------- File handling ----------

async function handleFiles(fileList) {
  store.patch({ mode: "loading" });
  const { valid, rejected } = await validateFiles(fileList);
  rejected.forEach(({ file, reason }) => {
    toast(`${baseName(file.name)}: ${reason}`, { type: "error" });
  });
  if (valid.length) {
    store.patch({
      mode: "loaded",
      fileName: valid.length === 1 ? valid[0].name : `${valid.length} files`,
      sourceFiles: valid.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      totalSize: valid.reduce((a, b) => a + b.size, 0),
      selected: [],
    });
    focusedId = null;
    anchorId = null;
  } else {
    store.patch({ mode: "empty", selected: [] });
    focusedId = null;
    anchorId = null;
  }
}

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

function selectRangeTo(to) {
  const state = getState();
  focusedId = state.pages[to]?.id ?? null;
  store.patch({ selected: selectRange(state.pages, anchorId, to) });
}

// ---------- Demo actions (page structure: tracked by history) ----------

function rotateSelected() {
  const state = getState();
  store.checkpoint((s) => {
    s.pages = rotatePages(s.pages, state.selected);
  });
}

function duplicateSelected() {
  const state = getState();
  const { pages, dupes, nextId: newNextId } = duplicatePages(
    state.pages,
    state.selected,
    nextId,
  );
  nextId = newNextId;
  focusedId = dupes[dupes.length - 1]?.id ?? null;
  store.checkpoint((s) => {
    s.pages = pages;
    s.selected = dupes.map((page) => page.id);
  });
}

function deleteSelected() {
  const state = getState();
  store.checkpoint((s) => {
    s.pages = deletePages(s.pages, state.selected);
    s.selected = [];
  });
  // focusedId / anchorId may have pointed at deleted pages; renderAll falls
  // back to the first remaining page, or null when no pages remain.
  renderAll();
}

// ---------- Wiring ----------

const gridCtl = mountGrid($("page-grid"), $("add-tile"), $("workarea"), {
  getState,
  onToggle: togglePage,
  onFocus: (id) => {
    // Only update focusedId; the grid updates roving tabindex in place and
    // never rebuilds DOM here, so a mid-click card is never destroyed.
    focusedId = id;
  },
  onSelectAll: selectAllPages,
  onSelectNone: () => store.patch({ selected: [] }),
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
  toast("Download is coming in the next phase.", { type: "success" });
});

// Rail (only Pages is implemented this phase).
$("rail-merge").addEventListener("click", () => {
  toast("Coming in the next phase.", { type: "success" });
});
$("rail-images").addEventListener("click", () => {
  toast("Coming in the next phase.", { type: "success" });
});
$("rail-extract").addEventListener("click", () => {
  toast("Coming in the next phase.", { type: "success" });
});

// Float bar.
const floatBar = mountFloatBar($("float-bar"), {
  onRotate: rotateSelected,
  onDuplicate: duplicateSelected,
  onExtract: () => {
    toast("Coming in the next phase.", { type: "success" });
  },
  onDelete: deleteSelected,
});

// Right panel.
const panel = mountPanel($("right-panel"), {
  onFileNameChange: (name) => store.patch({ fileName: name }),
  onExportModeChange: (mode) => {
    if (mode === "selected" && !getState().selected.length) {
      toast("Select pages first.", { type: "error" });
      return;
    }
    store.patch({ exportMode: mode });
  },
  onDownloadPDF: () => {
    toast("PDF export is coming in the next phase.", { type: "success" });
  },
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
  onDelete: deleteSelected,
  onUndo: () => {
    store.undo();
  },
  onRedo: () => {
    store.redo();
  },
  onDownload: () => {
    toast("Download is coming in the next phase.", { type: "success" });
  },
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

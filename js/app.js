import { mountNavbar } from "./navbar.js";
import { hydrateIcons } from "./icons.js";
import { toast } from "./toast.js";
import { createEditorState, createHistory, newId } from "./state.js";
import { takeFiles } from "./file-manager.js";
import {
  pickFiles,
  readBytes,
  downloadBytes,
  isPdf,
  isImage,
  formatBytes,
  baseName,
  MAX_FILE_BYTES,
} from "./file-manager.js";
import {
  openPdf,
  loadImage,
  imagePageSize,
  readPdfPageSizes,
  rotatedSize,
  renderToCanvas,
  exportPdf,
  PasswordProtectedError,
  A4,
} from "./pdf-viewer.js";
import {
  createAnnotationEditor,
  selectFromEvent as selectPagesFromEvent,
} from "./annotations.js";
import { createExportActions } from "./export.js";
import { createPdfOperations } from "./pdf-operations.js";
import { setupToolbar } from "./toolbar.js";

mountNavbar(document.querySelector("[data-navbar]"), { showCta: false, isStatic: true });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const els = {
  body: document.body,
  workspace: $("workspace"),
  thumbs: $("thumbs"),
  viewer: $("viewer"),
  pages: $("pages"),
  empty: $("empty"),
  emptyDrop: $("empty-drop"),
  title: $("doc-title"),
  fileName: $("file-name"),
  pageCount: $("page-count"),
  pageIndicator: $("page-indicator"),
  zoomValue: $("zoom-value"),
  infoPages: $("info-pages"),
  infoSources: $("info-sources"),
  infoSize: $("info-size"),
  selSummary: $("sel-summary"),
  netCount: $("net-count"),
  annotationHint: $("annotation-hint"),
  annotationColor: $("annotation-color"),
  formFieldColor: $("form-field-color"),
  annotationWidth: $("annotation-width"),
  textInspector: $("text-inspector"),
  selectedText: $("selected-text"),
  applyText: $("apply-text"),
  clearTextSelection: $("clear-text-selection"),
  annotationList: $("annotation-list"),
  annotationPageLabel: $("annotation-page-label"),
  formToolOptions: $("form-tool-options"),
  removeAllAnnotations: $("remove-all-annotations"),
  textFont: $("text-font"),
  textSize: $("text-size"),
  textColor: $("text-color"),
  customTextColor: $("custom-text-color"),
  textLink: $("text-link"),
  textLinkEditor: $("text-link-editor"),
  textUrl: $("text-url"),
  applyTextLink: $("apply-text-link"),
  clearTextLink: $("clear-text-link"),
  annotationUndo: $("annotation-undo"),
  annotationRedo: $("annotation-redo"),
  undo: $("btn-undo"),
  redo: $("btn-redo"),
  download: $("btn-download"),
};

const state = createEditorState();

const history = createHistory();

/* ---------- Render queue (keeps the main thread smooth) ---------- */
const queue = [];
let running = 0;
function enqueue(task, priority = false) {
  return new Promise((resolve, reject) => {
    const job = { task, resolve, reject };
    priority ? queue.unshift(job) : queue.push(job);
    pump();
  });
}
function pump() {
  while (running < 2 && queue.length) {
    const { task, resolve, reject } = queue.shift();
    running++;
    task()
      .then(resolve, reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}

/* ---------- Canvas caches ---------- */
const thumbCache = new Map();
const viewCache = new Map();
const VIEW_CACHE_LIMIT = 40;

function cachedCanvas(cache, key, page, scale, priority, limit) {
  if (cache.has(key)) {
    const c = cache.get(key);
    cache.delete(key);
    cache.set(key, c);
    return c;
  }
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const source = state.sources.get(page.sourceId);
  canvas.dataset.pending = "true";
  enqueue(async () => {
    await renderToCanvas(page, source, canvas, scale);
    delete canvas.dataset.pending;
    canvas.dispatchEvent(new Event("rendered"));
  }, priority).catch((err) => console.error("Render failed", err));
  cache.set(key, canvas);
  if (limit && cache.size > limit) cache.delete(cache.keys().next().value);
  return canvas;
}

/* ---------- State helpers ---------- */
const snapshot = () => ({
  pages: state.pages.map((page) => ({
    ...page,
    annotations: (page.annotations || []).map((annotation) => ({
      ...annotation,
      points: annotation.points?.map((point) => ({ ...point })),
    })),
  })),
  selected: [...state.selected],
});
function restore(snap) {
  state.pages = snap.pages;
  state.selected = new Set(snap.selected.filter((id) => state.pages.some((p) => p.id === id)));
}

function commit(mutate) {
  history.push(snapshot());
  mutate();
  state.dirty = true;
  render();
}

const operations = createPdfOperations({
  state,
  history,
  snapshot,
  restore,
  commit,
  render,
  toast,
  newId,
  rotatedSize,
  A4,
  scrollToPage,
});
const {
  selectedPages,
  indexOf,
  insertionIndex,
  rotate,
  removeSelected,
  duplicate,
  insertBlank,
  moveSelectedTo,
  moveSelectedBy,
  undo,
  redo,
} = operations;

/* ---------- Loading files ---------- */
async function addFiles(files, insertAt = state.pages.length) {
  if (!files.length) return;
  setBusy(true);
  const added = [];
  const wasEmpty = state.pages.length === 0;

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      toast(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`, { type: "error" });
      continue;
    }
    try {
      const bytes = await readBytes(file);
      const sourceId = newId("s");
      if (isPdf(file)) {
        const pdf = await openPdf(bytes);
        const sizes = await readPdfPageSizes(pdf);
        state.sources.set(sourceId, { kind: "pdf", bytes, pdf, name: file.name, size: file.size });
        sizes.forEach((s, index) =>
          added.push({ id: newId(), kind: "pdf", sourceId, index, rotation: 0, width: s.width, height: s.height })
        );
      } else if (isImage(file)) {
        const { bitmap, width, height } = await loadImage(bytes, file.type);
        state.sources.set(sourceId, { kind: "image", bytes, bitmap, type: file.type, name: file.name, size: file.size });
        added.push({ id: newId(), kind: "image", sourceId, index: 0, rotation: 0, ...imagePageSize(width, height) });
      } else {
        toast(`${file.name} isn't a PDF, JPG or PNG.`, { type: "error" });
        continue;
      }
      if (wasEmpty && state.name === "document") state.name = baseName(file.name);
    } catch (err) {
      if (err instanceof PasswordProtectedError) {
        toast(`${file.name} is password protected. Unlocking is coming soon.`, { type: "error" });
      } else {
        console.error(err);
        toast(`Couldn't open ${file.name}. The file may be damaged.`, { type: "error" });
      }
    }
  }

  setBusy(false);
  if (!added.length) return;
  markNetworkBaseline();
  commit(() => {
    state.pages.splice(insertAt, 0, ...added);
    state.selected = new Set();
  });
  if (wasEmpty) state.dirty = false;
  toast(`Added ${added.length} page${added.length === 1 ? "" : "s"}. Nothing was uploaded.`);
}

async function chooseFiles() {
  const files = await pickFiles();
  if (files.length) addFiles(files, insertionIndex());
}

const { fileName, downloadAll, saveSession, extractSelected } = createExportActions({
  state,
  els,
  setBusy,
  selectedPages,
  toast,
  formatBytes,
  exportPdf,
  downloadBytes,
});

const selectFromEvent = (id, event) =>
  selectPagesFromEvent(state, id, event, indexOf, renderSelection);

/* ---------- Rendering ---------- */
function render() {
  renderThumbs();
  renderViewer();
  renderChrome();
  renderSelection();
}

function renderThumbs() {
  const frag = document.createDocumentFragment();
  state.pages.forEach((page, i) => {
    const li = document.createElement("li");
    li.className = "thumb";
    li.dataset.id = page.id;
    li.id = `thumb-${page.id}`;
    li.setAttribute("role", "option");
    li.draggable = true;

    const { width, height } = rotatedSize(page);
    const scale = Math.min(170 / width, 150 / height);
    const frame = document.createElement("div");
    frame.className = "thumb-frame";
    const canvas = cachedCanvas(thumbCache, `${page.id}:${page.rotation}`, page, scale, false);
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
    frame.appendChild(canvas);

    const meta = document.createElement("div");
    meta.className = "thumb-meta";
    meta.textContent = String(i + 1);
    const tag = page.kind === "blank" ? "Blank" : page.kind === "image" ? "Image" : page.rotation ? `${page.rotation}°` : "";
    if (tag) {
      const t = document.createElement("span");
      t.className = "thumb-tag";
      t.textContent = tag;
      meta.appendChild(t);
    }
    li.setAttribute("aria-label", `Page ${i + 1}${tag ? `, ${tag}` : ""}`);
    li.append(frame, meta);
    frag.appendChild(li);
  });
  els.thumbs.replaceChildren(frag);
}

let viewObserver;
let currentObserver;
let annotationEditor;

function computeScale() {
  if (!state.fit || !state.pages.length) return state.zoom;
  const maxW = Math.max(...state.pages.map((p) => rotatedSize(p).width));
  const available = els.viewer.clientWidth - 64;
  return Math.max(0.25, Math.min(2, available / maxW));
}

function renderViewer() {
  viewObserver?.disconnect();
  currentObserver?.disconnect();
  const scale = computeScale();
  state.zoom = scale;
  const zoomKey = scale.toFixed(3);

  viewObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const page = state.pages.find((p) => p.id === el.dataset.id);
        if (!page || el.querySelector("canvas")) continue;
        el.appendChild(cachedCanvas(viewCache, `${page.id}:${page.rotation}:${zoomKey}`, page, scale, true, VIEW_CACHE_LIMIT));
        annotationEditor
          .attachPage(el, page, scale)
          .catch((error) => {
            console.error("Text layer failed", error);
            toast("Couldn't inspect the text on this page.", { type: "error" });
          });
      }
    },
    { root: els.viewer, rootMargin: "800px 0px" }
  );

  const ratios = new Map();
  currentObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => ratios.set(e.target.dataset.id, e.intersectionRatio));
      let best = null;
      let bestRatio = 0;
      ratios.forEach((r, id) => {
        if (r > bestRatio) {
          bestRatio = r;
          best = id;
        }
      });
      if (best && best !== state.currentId) {
        state.currentId = best;
        renderIndicator();
      }
    },
    { root: els.viewer, threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  const frag = document.createDocumentFragment();
  state.pages.forEach((page, i) => {
    const { width, height } = rotatedSize(page);
    const el = document.createElement("div");
    el.className = "vpage";
    el.dataset.id = page.id;
    el.style.width = `${width * scale}px`;
    el.style.height = `${height * scale}px`;
    const label = document.createElement("span");
    label.className = "vpage-label";
    label.textContent = `${i + 1}`;
    el.appendChild(label);
    frag.appendChild(el);
  });
  els.pages.replaceChildren(frag);
  els.pages.querySelectorAll(".vpage").forEach((el) => {
    viewObserver.observe(el);
    currentObserver.observe(el);
  });
}

function renderChrome() {
  const n = state.pages.length;
  const empty = n === 0;
  els.body.classList.toggle("is-empty", empty);
  els.empty.hidden = !empty;
  els.pageCount.textContent = String(n);
  els.infoPages.textContent = String(n);
  const used = new Set(state.pages.map((p) => p.sourceId).filter(Boolean));
  els.infoSources.textContent = String(used.size);
  let size = 0;
  used.forEach((id) => (size += state.sources.get(id)?.size || 0));
  els.infoSize.textContent = formatBytes(size);
  if (document.activeElement !== els.fileName) els.fileName.value = state.name;
  els.title.textContent = empty ? "No document" : fileName();
  els.download.disabled = empty || state.busy;
  $("save-changes").disabled = empty || state.busy;
  els.undo.disabled = !history.canUndo;
  els.redo.disabled = !history.canRedo;
  els.annotationUndo.disabled = !history.canUndo;
  els.annotationRedo.disabled = !history.canRedo;
  els.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  if (!state.pages.some((p) => p.id === state.currentId)) state.currentId = state.pages[0]?.id ?? null;
  renderIndicator();
}

function renderIndicator() {
  const n = state.pages.length;
  const i = indexOf(state.currentId);
  els.pageIndicator.textContent = n ? `${i + 1} / ${n}` : "—";
  els.thumbs.querySelectorAll(".thumb.is-current").forEach((t) => t.classList.remove("is-current"));
  annotationEditor?.renderInspector();
}

function renderSelection() {
  els.thumbs.querySelectorAll(".thumb").forEach((t) => {
    const id = t.dataset.id;
    t.setAttribute("aria-selected", String(state.selected.has(id)));
    t.classList.toggle("is-focused", id === state.focusId && document.activeElement === els.thumbs);
  });
  els.pages.querySelectorAll(".vpage").forEach((v) => v.classList.toggle("is-selected", state.selected.has(v.dataset.id)));
  if (state.focusId) els.thumbs.setAttribute("aria-activedescendant", `thumb-${state.focusId}`);

  const n = state.selected.size;
  els.selSummary.textContent = n
    ? `${n} page${n === 1 ? "" : "s"} selected`
    : state.pages.length
      ? "No pages selected. Click a page, or Shift-click for a range."
      : "No pages selected";
  document.querySelectorAll(".panel-actions [data-action]").forEach((button) => {
    button.disabled = n === 0;
  });
  $("btn-duplicate").disabled = n === 0;
  $("btn-delete").disabled = n === 0;
  $("btn-extract").disabled = n === 0;
  annotationEditor?.renderInspector();
}

function scrollToPage(id) {
  const el = els.pages.querySelector(`[data-id="${id}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setBusy(busy) {
  state.busy = busy;
  els.body.classList.toggle("is-busy", busy);
  els.download.disabled = busy || !state.pages.length;
}

function setZoom(z) {
  state.fit = false;
  state.zoom = Math.max(0.25, Math.min(4, z));
  renderViewer();
  renderChrome();
  renderSelection();
}

annotationEditor = createAnnotationEditor({
  state,
  commit,
  render,
  toast,
  els,
});

/* ---------- Network counter (proof of privacy) ---------- */
let networkBaseline = null;
let crossOriginCount = 0;
function markNetworkBaseline() {
  if (networkBaseline === null) networkBaseline = performance.now();
}
if ("PerformanceObserver" in window) {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (networkBaseline === null || entry.startTime < networkBaseline) continue;
      try {
        if (new URL(entry.name).origin !== location.origin) crossOriginCount++;
      } catch {}
    }
    els.netCount.textContent = String(crossOriginCount);
    els.netCount.classList.toggle("is-warn", crossOriginCount > 0);
  }).observe({ type: "resource", buffered: true });
}

setupToolbar({
  state,
  els,
  $,
  chooseFiles,
  undo,
  redo,
  rotate,
  insertBlank,
  duplicate,
  removeSelected,
  extractSelected,
  downloadAll,
  saveSession,
  setZoom,
  render,
  fileName,
  addFiles,
  insertionIndex,
  selectFromEvent,
  scrollToPage,
  renderSelection,
  indexOf,
  moveSelectedBy,
  moveSelectedTo,
  setAnnotationTool: (tool) => annotationEditor.setTool(tool),
  addStamp: (label) => annotationEditor.addStamp(label),
});

let resizeTimer;
new ResizeObserver(() => {
  if (!state.fit || !state.pages.length) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const next = computeScale();
    if (Math.abs(next - state.zoom) > 0.01) {
      renderViewer();
      renderChrome();
      renderSelection();
    }
  }, 150);
}).observe(els.viewer);

window.addEventListener("beforeunload", (e) => {
  if (state.dirty && state.pages.length) e.preventDefault();
});

/* ---------- Boot ---------- */
render();
takeFiles().then((files) => {
  if (files.length) addFiles(files);
});

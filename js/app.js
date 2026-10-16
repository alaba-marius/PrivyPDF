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
  toolbar: document.querySelector(".toolbar"),
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
  operationStatus: $("operation-status"),
};

const state = createEditorState();

const history = createHistory();
let editRevision = 0;
let renderedLayout = null;
let nextBusyId = 0;
const busyOperations = new Map();

function updateBusyState() {
  state.busy = busyOperations.size > 0;
  els.body.classList.toggle("is-busy", state.busy);
  els.workspace.inert = state.busy;
  els.toolbar.inert = state.busy;
  document.querySelectorAll(".text-insert-options, .shape-menu, .edit-tool-menu").forEach((menu) => {
    menu.inert = state.busy;
  });
  els.operationStatus.hidden = !state.busy;
  els.operationStatus.textContent = state.busy ? [...busyOperations.values()].at(-1) : "";
  els.download.disabled = state.busy || !state.pages.length;
  $("save-changes").disabled = state.busy || !state.pages.length;
}

function beginBusy(message) {
  const id = ++nextBusyId;
  busyOperations.set(id, message);
  updateBusyState();
  return () => {
    busyOperations.delete(id);
    updateBusyState();
  };
}

function pruneResources() {
  const retainedPageIds = new Set(state.pages.map((page) => page.id));
  const retainedSourceIds = new Set(state.pages.map((page) => page.sourceId).filter(Boolean));
  for (const id of history.getReferencedPageIds()) retainedPageIds.add(id);
  for (const id of history.getReferencedSourceIds()) retainedSourceIds.add(id);

  for (const cache of [thumbCache, viewCache]) {
    for (const [key, canvas] of cache) {
      const pageId = key.slice(0, key.indexOf(":"));
      if (!retainedPageIds.has(pageId)) {
        cache.delete(key);
        releaseCanvas(canvas);
        renderErrors.delete(pageId);
      }
    }
  }

  for (const [id, source] of state.sources) {
    if (retainedSourceIds.has(id)) continue;
    state.sources.delete(id);
    source.bitmap?.close();
    try {
      source.destroy?.()?.catch((error) => console.error("PDF cleanup failed", error));
    } catch (error) {
      console.error("PDF cleanup failed", error);
    }
    renderErrors.delete(id);
  }
}

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
const THUMB_CACHE_LIMIT = 100;
const VIEW_CACHE_LIMIT = 40;
const renderControllers = new WeakMap();
const renderErrors = new Set();

function releaseCanvas(canvas) {
  renderControllers.get(canvas)?.abort();
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

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
  const controller = new AbortController();
  renderControllers.set(canvas, controller);
  canvas.dataset.pending = "true";
  cache.set(key, canvas);
  while (limit && cache.size > limit) {
    const [oldKey, oldCanvas] = cache.entries().next().value;
    cache.delete(oldKey);
    releaseCanvas(oldCanvas);
  }
  enqueue(async () => {
    if (controller.signal.aborted || cache.get(key) !== canvas) return;
    await renderToCanvas(page, source, canvas, scale, { signal: controller.signal });
    if (controller.signal.aborted || cache.get(key) !== canvas) {
      releaseCanvas(canvas);
      return;
    }
    delete canvas.dataset.pending;
    canvas.dispatchEvent(new Event("rendered"));
  }, priority).catch((err) => {
    if (controller.signal.aborted || err?.name === "RenderingCancelledException") return;
    if (cache.get(key) === canvas) cache.delete(key);
    releaseCanvas(canvas);
    console.error("Render failed", err);
    const errorKey = page.sourceId || page.id;
    if (!renderErrors.has(errorKey)) {
      renderErrors.add(errorKey);
      toast("A page preview couldn't be rendered. Scroll away and back to retry.", { type: "error" });
    }
  });
  return canvas;
}

/* ---------- State helpers ---------- */
const snapshot = () => ({
  pages: state.pages.map((page) => ({
    ...page,
    annotations: structuredClone(page.annotations || []),
    formattingRanges: structuredClone(page.formattingRanges || []),
  })),
  selected: [...state.selected],
  textRangeSelection: state.textRangeSelection
    ? structuredClone(state.textRangeSelection)
    : null,
});
function restore(snap) {
  state.pages = snap.pages;
  state.selected = new Set(snap.selected.filter((id) => state.pages.some((p) => p.id === id)));
  state.textRangeSelection = snap.textRangeSelection
    ? structuredClone(snap.textRangeSelection)
    : null;
  editRevision++;
  renderedLayout = null;
}

function commit(mutate, { render: shouldRender = true } = {}) {
  history.push(snapshot());
  mutate();
  state.dirty = true;
  editRevision++;
  if (shouldRender) render();
  else {
    renderChrome();
    renderSelection();
  }
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
function addFiles(files, insertAt = null) {
  if (!files.length) return Promise.resolve();
  const finishBusy = beginBusy("Opening files…");
  const run = () => processFiles(files, insertAt ?? state.pages.length);
  const queued = fileLoadQueue.then(run, run);
  fileLoadQueue = queued.catch((error) => {
    console.error("Could not finish opening files", error);
    toast("Couldn't finish opening the selected files. Please try again.", { type: "error" });
  });
  return fileLoadQueue.finally(finishBusy);
}

let fileLoadQueue = Promise.resolve();
async function processFiles(files, insertAt) {
  const added = [];
  const wasEmpty = state.pages.length === 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      toast(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`, { type: "error" });
      continue;
    }
    if (!isPdf(file) && !isImage(file)) {
      toast(`${file.name} isn't a PDF, JPG or PNG.`, { type: "error" });
      continue;
    }
    let openedPdf;
    try {
      const bytes = await readBytes(file);
      const sourceId = newId("s");
      if (isPdf(file)) {
        openedPdf = await openPdf(bytes);
        const sizes = await readPdfPageSizes(openedPdf.pdf);
        state.sources.set(sourceId, {
          kind: "pdf",
          bytes,
          pdf: openedPdf.pdf,
          destroy: openedPdf.destroy,
          name: file.name,
          size: file.size,
        });
        openedPdf = null;
        sizes.forEach((s, index) =>
          added.push({ id: newId(), kind: "pdf", sourceId, index, rotation: 0, width: s.width, height: s.height })
        );
      } else {
        const { bitmap, width, height } = await loadImage(bytes, file.type);
        state.sources.set(sourceId, { kind: "image", bytes, bitmap, type: file.type, name: file.name, size: file.size });
        added.push({ id: newId(), kind: "image", sourceId, index: 0, rotation: 0, ...imagePageSize(width, height) });
      }
      if (wasEmpty && state.name === "document") state.name = baseName(file.name);
    } catch (err) {
      if (openedPdf) {
        try {
          openedPdf.destroy()?.catch((error) => console.error("PDF cleanup failed", error));
        } catch (error) {
          console.error("PDF cleanup failed", error);
        }
      }
      if (err instanceof PasswordProtectedError) {
        toast(`${file.name} is password protected. Unlocking is coming soon.`, { type: "error" });
      } else {
        console.error(err);
        toast(`Couldn't open ${file.name}. The file may be damaged.`, { type: "error" });
      }
    }
  }

  if (!added.length) return;
  markNetworkBaseline();
  commit(() => {
    state.pages.splice(insertAt, 0, ...added);
    state.selected = new Set();
  });
  if (wasEmpty) state.dirty = false;
  toast(`Added ${added.length} page${added.length === 1 ? "" : "s"}. Nothing was uploaded.`);
}

let filePickerOpen = false;
async function chooseFiles() {
  if (state.busy || filePickerOpen) return;
  filePickerOpen = true;
  try {
    const files = await pickFiles();
    if (files.length) await addFiles(files, insertionIndex());
  } finally {
    filePickerOpen = false;
  }
}

const { fileName, downloadAll, saveSession, extractSelected } = createExportActions({
  state,
  els,
  beginBusy,
  snapshotPages: () => snapshot().pages,
  getRevision: () => editRevision,
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
  const layout = pageLayoutKey();
  if (layout !== renderedLayout) {
    renderedLayout = layout;
    renderThumbs();
    renderViewer();
  } else {
    renderAnnotationLayers();
  }
  renderThumbnailOverlays();
  renderChrome();
  renderSelection();
  pruneResources();
}

function pageLayoutKey() {
  const scale = state.fit ? computeScale() : state.zoom;
  return JSON.stringify([
    scale.toFixed(3),
    ...state.pages.map(({ id, sourceId, index, kind, rotation, width, height }) =>
      [id, sourceId, index, kind, rotation, width, height]
    ),
  ]);
}

function renderAnnotationLayers() {
  const pagesById = new Map(state.pages.map((page) => [page.id, page]));
  for (const el of els.pages.children) {
    const page = pagesById.get(el.dataset.id);
    const layer = el.querySelector(".page-annotation-layer");
    if (page && layer) annotationEditor?.renderLayer(layer, page);
  }
}

let thumbObserver;
const thumbnailOverlayStates = new WeakMap();
function renderThumbnailOverlay(frame, page, force = false) {
  const canvas = frame.querySelector("canvas");
  if (!canvas || !annotationEditor) return;

  let layer = frame.querySelector(".page-annotation-layer");
  const needsRender = !layer;
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "page-annotation-layer";
    frame.appendChild(layer);
  }

  const { width, height } = rotatedSize(page);
  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;
  if (!canvasWidth || !canvasHeight) return;
  const scale = Math.min(canvasWidth / width, canvasHeight / height);
  layer.style.width = `${canvasWidth}px`;
  layer.style.height = `${canvasHeight}px`;

  const previous = thumbnailOverlayStates.get(frame);
  if (
    !force &&
    !needsRender &&
    previous?.annotations === page.annotations &&
    previous.rotation === page.rotation &&
    previous.width === canvasWidth &&
    previous.height === canvasHeight
  ) return;

  annotationEditor.renderLayer(layer, page, { scale, staticPreview: true });
  thumbnailOverlayStates.set(frame, {
    annotations: page.annotations,
    rotation: page.rotation,
    width: canvasWidth,
    height: canvasHeight,
  });
}

function renderThumbnailOverlays() {
  const pagesById = new Map(state.pages.map((page) => [page.id, page]));
  for (const item of els.thumbs.children) {
    const page = pagesById.get(item.dataset.id);
    const frame = item.querySelector(".thumb-frame");
    if (page && frame?.querySelector("canvas")) renderThumbnailOverlay(frame, page);
  }
}

function renderThumbs() {
  thumbObserver?.disconnect();
  const existing = new Map([...els.thumbs.children].map((item) => [item.dataset.id, item]));
  const frag = document.createDocumentFragment();
  state.pages.forEach((page, i) => {
    let li = existing.get(page.id);
    if (!li) {
      li = document.createElement("li");
      li.className = "thumb";
      li.append(document.createElement("div"), document.createElement("div"));
      li.children[0].className = "thumb-frame";
      li.children[1].className = "thumb-meta";
    }
    li.dataset.id = page.id;
    li.id = `thumb-${page.id}`;
    li.setAttribute("role", "option");
    li.draggable = true;

    const { width, height } = rotatedSize(page);
    const scale = Math.min(170 / width, 150 / height);
    const frame = li.querySelector(".thumb-frame");
    const key = `${page.id}:${page.rotation}`;
    if (frame.dataset.renderKey !== key) {
      frame.dataset.renderKey = key;
      const skeleton = document.createElement("div");
      skeleton.className = "thumb-skeleton";
      skeleton.style.width = `${width * scale}px`;
      skeleton.style.height = `${height * scale}px`;
      skeleton.setAttribute("aria-hidden", "true");
      frame.replaceChildren(skeleton);
    }

    const meta = li.querySelector(".thumb-meta");
    meta.replaceChildren(document.createTextNode(String(i + 1)));
    const tag = page.kind === "blank" ? "Blank" : page.kind === "image" ? "Image" : page.rotation ? `${page.rotation}°` : "";
    if (tag) {
      const t = document.createElement("span");
      t.className = "thumb-tag";
      t.textContent = tag;
      meta.appendChild(t);
    }
    li.setAttribute("aria-label", `Page ${i + 1}${tag ? `, ${tag}` : ""}`);
    frag.appendChild(li);
  });
  els.thumbs.replaceChildren(frag);
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const frame = entry.target;
        if (frame.querySelector("canvas")) continue;
        const pageId = frame.closest(".thumb")?.dataset.id;
        const page = state.pages.find((item) => item.id === pageId);
        if (!page) continue;
        const { width, height } = rotatedSize(page);
        const scale = Math.min(170 / width, 150 / height);
        const canvas = cachedCanvas(
          thumbCache,
          `${page.id}:${page.rotation}`,
          page,
          scale,
          false,
          THUMB_CACHE_LIMIT
        );
        canvas.style.width = `${width * scale}px`;
        canvas.style.height = `${height * scale}px`;
        frame.replaceChildren(canvas);
        renderThumbnailOverlay(frame, page);
      }
    },
    { root: els.thumbs.parentElement, rootMargin: "320px 0px" }
  );
  els.thumbs.querySelectorAll(".thumb-frame").forEach((frame) => thumbObserver.observe(frame));
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
  renderedLayout = pageLayoutKey();
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
  renderThumbnail: (page) => {
    const item = [...els.thumbs.children].find((thumbnail) => thumbnail.dataset.id === page.id);
    const frame = item?.querySelector(".thumb-frame");
    if (frame) renderThumbnailOverlay(frame, page, true);
  },
  toast,
  els,
  beginBusy,
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
  if (state.busy || (state.dirty && state.pages.length)) e.preventDefault();
});

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  thumbObserver?.disconnect();
  viewObserver?.disconnect();
  currentObserver?.disconnect();
  for (const cache of [thumbCache, viewCache]) {
    for (const canvas of cache.values()) releaseCanvas(canvas);
    cache.clear();
  }
  for (const source of state.sources.values()) {
    source.bitmap?.close();
    try {
      source.destroy?.()?.catch((error) => console.error("PDF cleanup failed", error));
    } catch (error) {
      console.error("PDF cleanup failed", error);
    }
  }
  state.sources.clear();
});

/* ---------- Boot ---------- */
render();
takeFiles().then((files) => {
  if (files.length) addFiles(files);
}).catch((error) => {
  console.error("Could not retrieve the local file handoff", error);
  toast("Couldn't retrieve the files from the previous page. Use Add files to choose them again.", {
    type: "error",
  });
});

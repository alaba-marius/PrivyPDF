export const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg";
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

export const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
export const isImage = (file) => file.type === "image/png" || file.type === "image/jpeg";
export const isSupported = (file) => isPdf(file) || isImage(file);

export function pickFiles({ accept = ACCEPT, multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files || [])]), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

export function downloadBytes(bytes, filename, type = "application/pdf") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function setupDropTarget(el, onFiles) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");

  el.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    el.classList.add("is-dragging");
  });
  el.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  el.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.classList.remove("is-dragging");
  });
  el.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    el.classList.remove("is-dragging");
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  });
}

export function formatBytes(n) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function baseName(name) {
  return name.replace(/\.[^.]+$/, "") || "document";
}
// Passes files from the landing page to the editor through IndexedDB.
// The data stays in this browser and is deleted as soon as the editor reads it.
const DB = "folio-local";
const STORE = "handoff";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("The local file handoff was interrupted."));
  });
}

export async function stashFiles(files) {
  const db = await openDb();
  try {
    await tx(db, "readwrite", (s) => s.put(files, "pending"));
  } finally {
    db.close();
  }
}

export async function takeFiles() {
  const db = await openDb();
  try {
    const files = await tx(db, "readonly", (s) => s.get("pending"));
    await tx(db, "readwrite", (s) => s.delete("pending"));
    return files || [];
  } finally {
    db.close();
  }
}

export const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg";

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
  // The rebuilt editor calls this to receive files stashed by the landing page.
  const db = await openDb();
  try {
    const files = await tx(db, "readonly", (s) => s.get("pending"));
    await tx(db, "readwrite", (s) => s.delete("pending"));
    return files || [];
  } finally {
    db.close();
  }
}

export const MAX_FILE_BYTES = 500 * 1024 * 1024;

export async function readBytes(file, bytes = 1024) {
  const slice = file.slice(0, Math.min(bytes, file.size));
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

export function formatBytes(size) {
  if (size == null) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} ${units[unit]}` : `${value.toFixed(2)} ${units[unit]}`;
}

export function baseName(path) {
  return String(path).split(/[\\/\\\\]/).pop();
}

export async function downloadBytes(name, bytes) {
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.href = url;
  a.download = name;
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MAGIC_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]);
const MAGIC_PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const MAGIC_JPEG = new Uint8Array([0xFF, 0xD8, 0xFF]);

function startsWith(header, magic) {
  if (header.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (header[i] !== magic[i]) return false;
  }
  return true;
}

export async function validateFiles(files) {
  const valid = [];
  const rejected = [];
  for (const file of files) {
    try {
      if (!file || file.size == null || file.size === 0) {
        rejected.push({ file, reason: "empty file" });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push({ file, reason: "too large" });
        continue;
      }
      const header = await readBytes(file);
      let accepted = false;
      if (isPdf(file)) {
        accepted = startsWith(header, MAGIC_PDF);
        if (!accepted) rejected.push({ file, reason: "not a PDF" });
      } else if (isImage(file)) {
        accepted = startsWith(header, MAGIC_PNG) || startsWith(header, MAGIC_JPEG);
        if (!accepted) rejected.push({ file, reason: "unsupported type" });
      } else {
        rejected.push({ file, reason: "unsupported type" });
      }
      if (accepted) valid.push(file);
    } catch {
      rejected.push({ file, reason: "unable to read" });
    }
  }
  return { valid, rejected };
}

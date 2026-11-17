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

// Source registry: one entry per loaded file. Source bytes, the pdf.js
// document and decoded images live here — never in the store and never in undo
// history. History snapshots contain only the tracked `pages` list, and pages
// refer to sources by source id.

const sources = new Map();
let nextSourceId = 1;

export function createSource(input) {
  const source = { id: `s${nextSourceId++}`, ...input };
  sources.set(source.id, source);
  return source;
}

export function getSource(id) {
  return sources.get(id);
}

export function removeSource(id) {
  sources.delete(id);
}

export function forEachSource(fn) {
  sources.forEach(fn);
}

export function sourceCount() {
  return sources.size;
}

export function totalPages() {
  let total = 0;
  sources.forEach((source) => {
    total += source.pageCount;
  });
  return total;
}

export function totalBytes() {
  let total = 0;
  sources.forEach((source) => {
    total += source.size;
  });
  return total;
}

export function clearSources() {
  sources.clear();
  nextSourceId = 1;
}

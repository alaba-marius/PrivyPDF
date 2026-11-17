// Pure page logic: no DOM, no store. Receives plain data and returns new
// values, so the same rules apply to demo documents and real file loads.
// Page ids are strings ("p1", "p2"…) but click handlers pass string ids read
// from data attributes, so normalize on both sides of the comparison as a
// safety net for any mixed numeric/string input.
export function toggleSelection(selected, id) {
  const key = String(id);
  const next = new Set(selected.map((x) => String(x)));
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return [...next];
}

export function selectAll(pages) {
  return pages.map((page) => page.id);
}

// selectRange selects the inclusive range from the anchor page to the target
// index. anchorId may be null (no anchor yet): then only the target is selected.
export function selectRange(pages, anchorId, to) {
  const from = pages.findIndex((page) => String(page.id) === String(anchorId));
  const anchor = from === -1 ? to : from;
  const a = Math.min(anchor, to);
  const b = Math.max(anchor, to);
  return pages.slice(a, b + 1).map((page) => page.id);
}

export function clampSelection(selected, pages) {
  const ids = new Set(pages.map((page) => String(page.id)));
  return selected.filter((id) => ids.has(String(id)));
}

export function rotateSelected(pages, selected) {
  const sel = new Set(selected);
  return pages.map((page) =>
    sel.has(page.id) ? { ...page, rotated: (page.rotated + 90) % 360 } : page,
  );
}

export function duplicateSelected(pages, selected, nextId) {
  const sel = new Set(selected);
  const result = [];
  const dupes = [];
  let next = nextId;
  for (const page of pages) {
    result.push(page);
    if (sel.has(page.id)) {
      // Ids are strings ("p1", "p2"…); duplicates continue the same prefix.
      const dupe = { id: `p${next++}`, rotated: 0 };
      dupes.push(dupe);
      result.push(dupe);
    }
  }
  return { pages: result, dupes, nextId: next };
}

export function deleteSelected(pages, selected) {
  const sel = new Set(selected);
  return pages.filter((page) => !sel.has(page.id));
}

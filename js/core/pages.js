// Pure page logic: no DOM, no store. Receives plain data and returns new
// values, so the same rules apply to every document regardless of how it was
// loaded. Page ids are strings ("p1", "p2"…) but click handlers pass string ids
// read from data attributes, so normalize on both sides of the comparison as a
// safety net for any mixed numeric/string input.
//
// A page is { id, sourceId, index, baseRotation, rotated, width, height }:
//   sourceId  which source the page came from
//   index     the page's index within that source
//   baseRotation the file's own /Rotate (0, 90, 180 or 270), never touched by
//               the user
//   rotated   rotation the user applied, in 90-degree steps
//   width/height page size in points at rotation 0 (from the viewport at scale
//               1 and rotation 0)
// The effective display rotation is (baseRotation + rotated) % 360.

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

export function clampSelection(selected, pages) {
  const ids = new Set(pages.map((page) => String(page.id)));
  return selected.filter((id) => ids.has(String(id)));
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
      // A duplicate keeps its source and position in the document, only its id
      // and user rotation are fresh.
      const dupe = {
        id: `p${next++}`,
        sourceId: page.sourceId,
        index: page.index,
        baseRotation: page.baseRotation,
        rotated: 0,
        width: page.width,
        height: page.height,
      };
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

// effectiveRotation is the rotation the user sees on screen: the file's own
// rotation plus whatever the user applied, wrapped to 0/90/180/270.
export function effectiveRotation(page) {
  return (((page.baseRotation ?? 0) + (page.rotated ?? 0)) % 360 + 360) % 360;
}

// moveSelected moves the selected pages (or, when nothing is selected, the
// single page at `focusedId`) as a block to insertion index `toIndex` in the
// list that remains after the block is taken out. Returns a new pages array;
// ids and selection survive so focus and selection follow the moved pages.
export function moveSelected(pages, selectedIds, focusedId, toIndex) {
  const sel = new Set(selectedIds.map(String));
  const moved = pages.filter((page) => sel.has(String(page.id)));
  const movedIds = new Set(moved.map((page) => String(page.id)));
  // When nothing is selected, move the single focused page — but only once,
  // and keep it out of the rest of the list so it cannot appear twice.
  if (moved.length === 0 && focusedId != null && !movedIds.has(String(focusedId))) {
    const focusedPage = pages.find((page) => page.id === focusedId);
    if (focusedPage) {
      moved.push(focusedPage);
      movedIds.add(String(focusedId));
    }
  }
  const rest = pages.filter((page) => !movedIds.has(String(page.id)));
  toIndex = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, toIndex), ...moved, ...rest.slice(toIndex)];
}

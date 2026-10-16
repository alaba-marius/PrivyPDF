export function createPdfOperations({
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
}) {
  const selectedPages = () => state.pages.filter((page) => state.selected.has(page.id));
  const targetPages = () => (state.selected.size ? selectedPages() : state.pages);
  const indexOf = (id) => state.pages.findIndex((page) => page.id === id);

  function insertionIndex() {
    if (!state.selected.size) return state.pages.length;
    const last = Math.max(...[...state.selected].map(indexOf));
    return last + 1;
  }

  function rotate(delta) {
    const ids = new Set(targetPages().map((page) => page.id));
    if (!ids.size) return;
    commit(() => {
      state.pages = state.pages.map((page) =>
        ids.has(page.id) ? { ...page, rotation: (page.rotation + delta + 360) % 360 } : page
      );
    });
  }

  function removeSelected() {
    if (!state.selected.size) {
      toast("Select pages to delete first.", { type: "error" });
      return;
    }
    const count = state.selected.size;
    const firstIndex = Math.min(...[...state.selected].map(indexOf));
    commit(() => {
      state.pages = state.pages.filter((page) => !state.selected.has(page.id));
      state.selected = new Set();
      const next = state.pages[Math.min(firstIndex, state.pages.length - 1)];
      if (next) {
        state.selected.add(next.id);
        state.anchorId = state.focusId = next.id;
      }
    });
    toast(`Deleted ${count} page${count === 1 ? "" : "s"}. Press Ctrl+Z to undo.`);
  }

  function duplicate() {
    if (!state.selected.size) return;
    commit(() => {
      const pages = [];
      const fresh = new Set();
      for (const page of state.pages) {
        pages.push(page);
        if (state.selected.has(page.id)) {
          const copy = { ...page, id: newId() };
          if (page.annotations) {
            const annotations = structuredClone(page.annotations);
            const annotationIds = new Map(
              annotations.map((annotation) => [annotation.id, newId()])
            );
            copy.annotations = annotations.map((annotation) => ({
              ...annotation,
              id: annotationIds.get(annotation.id),
              ...(annotation.textTarget?.kind === "annotation"
                ? {
                    textTarget: {
                      ...annotation.textTarget,
                      id: annotationIds.get(annotation.textTarget.id) || annotation.textTarget.id,
                    },
                  }
                : {}),
            }));
          }
          pages.push(copy);
          fresh.add(copy.id);
        }
      }
      state.pages = pages;
      state.selected = fresh;
    });
  }

  function insertBlank() {
    const at = insertionIndex();
    const reference = state.pages[at - 1] || state.pages[0];
    const size = reference ? rotatedSize(reference) : A4;
    const page = { id: newId(), kind: "blank", sourceId: null, index: 0, rotation: 0, ...size };
    commit(() => {
      state.pages.splice(at, 0, page);
      state.selected = new Set([page.id]);
      state.anchorId = state.focusId = page.id;
    });
    scrollToPage(page.id);
  }

  function moveSelectedTo(targetId, after) {
    if (state.selected.has(targetId)) return;
    commit(() => {
      const moving = selectedPages();
      const remaining = state.pages.filter((page) => !state.selected.has(page.id));
      const targetIndex = remaining.findIndex((page) => page.id === targetId) + (after ? 1 : 0);
      remaining.splice(targetIndex, 0, ...moving);
      state.pages = remaining;
    });
  }

  function moveSelectedBy(delta) {
    if (!state.selected.size) return;
    const indexes = [...state.selected].map(indexOf).sort((a, b) => a - b);
    if (delta < 0) {
      let index = indexes[0] - 1;
      while (index >= 0 && state.selected.has(state.pages[index].id)) index--;
      if (index >= 0) moveSelectedTo(state.pages[index].id, false);
    } else {
      let index = indexes[indexes.length - 1] + 1;
      while (index < state.pages.length && state.selected.has(state.pages[index].id)) index++;
      if (index < state.pages.length) moveSelectedTo(state.pages[index].id, true);
    }
  }

  function undo() {
    const previous = history.undo(snapshot());
    if (previous) {
      restore(previous);
      state.dirty = true;
      render();
    }
  }

  function redo() {
    const next = history.redo(snapshot());
    if (next) {
      restore(next);
      state.dirty = true;
      render();
    }
  }

  return {
    selectedPages,
    targetPages,
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
  };
}
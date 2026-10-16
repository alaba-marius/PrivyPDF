export function createHistory(limit = 100) {
  const past = [];
  const future = [];
  return {
    push(snapshot) {
      past.push(snapshot);
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      return future.pop();
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    getReferencedPageIds() {
      return new Set(
        [...past, ...future].flatMap((snapshot) => snapshot.pages.map((page) => page.id))
      );
    },
    getReferencedSourceIds() {
      return new Set(
        [...past, ...future]
          .flatMap((snapshot) => snapshot.pages)
          .map((page) => page.sourceId)
          .filter(Boolean)
      );
    },
  };
}

export function createEditorState() {
  return {
    sources: new Map(),
    pages: [],
    selected: new Set(),
    anchorId: null,
    focusId: null,
    currentId: null,
    textSelection: null,
    annotationTool: "drag",
    editorMode: "annotate",
    zoom: 1,
    fit: true,
    name: "document",
    dirty: false,
    busy: false,
  };
}

let uid = 0;

export function newId(prefix = "p") {
  return `${prefix}${++uid}`;
}

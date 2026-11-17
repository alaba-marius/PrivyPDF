// Tiny observable store with snapshot-based undo/redo history. Pure JS, no DOM.
//
// History only tracks the keys listed in `track` (e.g. ["pages"]). Selection,
// file name, size and other UI state are changed with `patch()` and never
// create history entries. `checkpoint(fn)` clones the live state into a draft,
// calls fn(draft), then pushes the OLD state to history and swaps in the draft
// — the live state and history snapshots are never mutated.
export function createStore(initial, { track } = {}) {
  let state = initial;
  const subscribers = new Set();
  const past = [];
  const future = [];
  const cap = 100;

  function notify() {
    const current = state;
    subscribers.forEach((fn) => fn(current));
  }

  function trackedSnapshot() {
    if (!track || track.length === 0) return structuredClone(state);
    const picked = {};
    for (const key of track) {
      if (key in state) picked[key] = structuredClone(state[key]);
    }
    return picked;
  }

  function mergeTracked(restored) {
    // Restore only the tracked keys; leave everything else untouched.
    if (!track || track.length === 0) return restored;
    const merged = { ...state };
    for (const key of track) {
      if (key in restored) merged[key] = restored[key];
    }
    return merged;
  }

  function clampSelection() {
    const pages = state.pages;
    if (!Array.isArray(pages)) return;
    const ids = new Set(pages.map((page) => page.id));
    state.selected = (state.selected || []).filter((id) => ids.has(id));
  }

  function push() {
    if (past.length >= cap) past.shift();
    past.push(trackedSnapshot());
    future.length = 0;
  }

  return {
    get() {
      return state;
    },
    set(next) {
      state = next;
      notify();
    },
    patch(partial) {
      state = { ...state, ...partial };
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      fn(state);
      return () => subscribers.delete(fn);
    },
    undo() {
      if (past.length === 0) return false;
      future.push(trackedSnapshot());
      state = mergeTracked(past.pop());
      clampSelection();
      notify();
      return true;
    },
    redo() {
      if (future.length === 0) return false;
      past.push(trackedSnapshot());
      state = mergeTracked(future.pop());
      clampSelection();
      notify();
      return true;
    },
    // Group a multi-step action so it undoes as one entry. This is the only
    // way to create a tracked history entry (clears the redo stack).
    checkpoint(fn) {
      push();
      const draft = structuredClone(state);
      fn(draft);
      state = draft;
      clampSelection();
      notify();
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    clearHistory() {
      past.length = 0;
      future.length = 0;
    },
  };
}

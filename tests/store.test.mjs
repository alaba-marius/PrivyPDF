import { test } from "node:test";
import assert from "node:assert";
import { createStore } from "../js/core/store.js";

test("patch merges partial state and notifies subscribers", (t) => {
  const store = createStore({ a: 1, b: 2 });
  const seen = [];
  store.subscribe((s) => seen.push(s));
  store.patch({ b: 3 });
  assert.deepStrictEqual(seen[seen.length - 1], { a: 1, b: 3 });
});

test("checkpoint receives the current state as a draft", (t) => {
  const store = createStore({ pages: [{ id: 1, rotated: 0 }] });
  let received;
  store.checkpoint((s) => {
    received = s;
    s.pages[0].rotated = 90;
  });
  assert.ok(received);
  assert.equal(store.get().pages[0].rotated, 90);
});

test("checkpoint pushes the old state and swaps in the draft", (t) => {
  const store = createStore({ pages: [{ id: 1 }] });
  store.checkpoint((s) => {
    s.pages.push({ id: 2 });
  });
  assert.deepStrictEqual(store.get().pages.map((p) => p.id), [1, 2]);
  assert.equal(store.undo(), true);
  assert.deepStrictEqual(store.get().pages.map((p) => p.id), [1]);
});

test("checkpoint creates one history entry for multiple mutations", (t) => {
  const store = createStore({ pages: [{ id: 1 }] });
  store.checkpoint((s) => {
    s.pages.push({ id: 2 });
    s.pages.push({ id: 3 });
  });
  assert.equal(store.undo(), true);
  assert.deepStrictEqual(store.get().pages.map((p) => p.id), [1]);
  assert.equal(store.undo(), false);
});

test("live state is not mutated before the checkpoint callback runs", (t) => {
  const store = createStore({ count: 0 });
  let sawDuring = null;
  store.checkpoint((s) => {
    sawDuring = store.get().count;
    s.count = 5;
  });
  assert.equal(sawDuring, 0);
  assert.equal(store.get().count, 5);
});

test("patch never creates a history entry", (t) => {
  const store = createStore({ pages: [{ id: 1 }], selected: [] }, { track: ["pages"] });
  store.patch({ selected: [1] });
  assert.equal(store.canUndo(), false);
  assert.equal(store.undo(), false);
});

test("tracked keys only: undo restores pages, leaves other state untouched", (t) => {
  const store = createStore({ pages: [{ id: 1 }], size: "small" }, { track: ["pages"] });
  store.checkpoint((s) => { s.pages = [{ id: 2 }]; });
  store.patch({ size: "large" });
  assert.equal(store.undo(), true);
  const s = store.get();
  assert.deepStrictEqual(s.pages.map((p) => p.id), [1]);
  assert.equal(s.size, "large");
});

test("canUndo and canRedo reflect history state", (t) => {
  const store = createStore({ pages: [{ id: 1 }] }, { track: ["pages"] });
  assert.equal(store.canUndo(), false);
  assert.equal(store.canRedo(), false);
  store.checkpoint((s) => { s.pages.push({ id: 2 }); });
  assert.equal(store.canUndo(), true);
  assert.equal(store.canRedo(), false);
  assert.equal(store.undo(), true);
  assert.equal(store.canRedo(), true);
  assert.equal(store.redo(), true);
  assert.equal(store.canRedo(), false);
});

test("a new tracked change clears the redo stack", (t) => {
  const store = createStore({ pages: [{ id: 1 }] }, { track: ["pages"] });
  store.checkpoint((s) => { s.pages.push({ id: 2 }); });
  store.undo();
  assert.equal(store.canRedo(), true);
  store.checkpoint((s) => { s.pages.push({ id: 3 }); });
  assert.equal(store.canRedo(), false);
});

test("history is capped at 100 snapshots", (t) => {
  const store = createStore({ n: 0 }, { track: ["n"] });
  for (let i = 0; i < 150; i++) {
    store.checkpoint((s) => { s.n = i; });
  }
  let undos = 0;
  while (store.undo()) undos++;
  assert.equal(undos, 100);
});

test("undo and redo on empty history return false", (t) => {
  const store = createStore({ n: 0 }, { track: ["n"] });
  assert.equal(store.undo(), false);
  assert.equal(store.redo(), false);
});

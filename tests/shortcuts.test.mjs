import { test } from "node:test";
import assert from "node:assert";
import { matchShortcut } from "../js/core/shortcuts.js";

function ev(overrides) {
  return { key: "z", ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

test("ctrl+z is undo", (t) => {
  assert.equal(matchShortcut(ev({ ctrlKey: true })), "undo");
});

test("ctrl+shift+Z is redo", (t) => {
  assert.equal(matchShortcut(ev({ ctrlKey: true, shiftKey: true, key: "Z" })), "redo");
});

test("ctrl+shift+z is redo (keys compared case-insensitively)", (t) => {
  assert.equal(matchShortcut(ev({ ctrlKey: true, shiftKey: true })), "redo");
});

test("caps lock z is undo, not redo", (t) => {
  // Caps Lock upper-cases event.key without setting shiftKey, so the plain-z
  // branch must win because the shift variant is checked first.
  assert.equal(matchShortcut(ev({ ctrlKey: true, key: "Z" })), "undo");
});

test("meta (cmd) key counts as a modifier", (t) => {
  assert.equal(matchShortcut(ev({ metaKey: true })), "undo");
  assert.equal(matchShortcut(ev({ metaKey: true, shiftKey: true })), "redo");
});

test("ctrl+y is redo", (t) => {
  assert.equal(matchShortcut(ev({ ctrlKey: true, key: "y" })), "redo");
});

test("plain r is rotate, case-insensitively", (t) => {
  assert.equal(matchShortcut(ev({ key: "r" })), "rotate");
  assert.equal(matchShortcut(ev({ key: "R" })), "rotate");
});

test("Delete is delete", (t) => {
  assert.equal(matchShortcut(ev({ key: "Delete" })), "delete");
});

test("ctrl+s is download", (t) => {
  assert.equal(matchShortcut(ev({ ctrlKey: true, key: "s" })), "download");
  assert.equal(matchShortcut(ev({ ctrlKey: true, key: "S" })), "download");
});

test("unknown keys return null", (t) => {
  assert.equal(matchShortcut(ev({ key: "q" })), null);
  assert.equal(matchShortcut(ev({ ctrlKey: true, key: "q" })), null);
  assert.equal(matchShortcut(ev({ shiftKey: true, key: "z" })), null);
});

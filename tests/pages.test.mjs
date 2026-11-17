import { test } from "node:test";
import assert from "node:assert";
import {
  toggleSelection,
  selectAll,
  selectRange,
  clampSelection,
  rotateSelected,
  duplicateSelected,
  deleteSelected,
} from "../js/core/pages.js";

const page = (id, rotated = 0) => ({ id, rotated });
const demoPages = () => [
  page("p1"),
  page("p2"),
  page("p3"),
  page("p4"),
  page("p5"),
  page("p6"),
  page("p7"),
];
const numericPages = () => [page(1), page(2), page(3)];

test("toggleSelection adds an unselected id", (t) => {
  assert.deepStrictEqual(toggleSelection([], "p1"), ["p1"]);
});

test("toggleSelection removes a selected id", (t) => {
  assert.deepStrictEqual(toggleSelection(["p1", "p2"], "p2"), ["p1"]);
});

test("toggleSelection does not duplicate an already-selected id", (t) => {
  assert.deepStrictEqual(toggleSelection(["p1"], "p1"), []);
});

test("toggleSelection accepts a string id from a dataset against numeric stored ids", (t) => {
  // Clicking passes card.dataset.id (a string); the store holds string ids.
  assert.deepStrictEqual(toggleSelection(["1", "2", "3"], "2"), ["1", "3"]);
});

test("toggleSelection adds a numeric id to a string selection", (t) => {
  assert.deepStrictEqual(toggleSelection(["p1", "p2"], 3), ["p1", "p2", "3"]);
});

test("selectAll returns every page id", (t) => {
  assert.deepStrictEqual(selectAll(demoPages()), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
  assert.deepStrictEqual(selectAll(numericPages()), [1, 2, 3]);
  assert.deepStrictEqual(selectAll([]), []);
});

test("selectRange from the anchored page to a target index, inclusive", (t) => {
  assert.deepStrictEqual(selectRange(demoPages(), "p1", 0), ["p1"]);
  assert.deepStrictEqual(selectRange(demoPages(), "p1", 2), ["p1", "p2", "p3"]);
});

test("selectRange works backwards (target index before the anchor)", (t) => {
  assert.deepStrictEqual(selectRange(demoPages(), "p3", 0), ["p1", "p2", "p3"]);
});

test("selectRange anchors on a string id from a dataset over numeric page ids", (t) => {
  assert.deepStrictEqual(selectRange(numericPages(), "2", 2), [2, 3]);
  assert.deepStrictEqual(selectRange(numericPages(), "1", 2), [1, 2, 3]);
});

test("selectRange with no anchor selects only the target", (t) => {
  assert.deepStrictEqual(selectRange(demoPages(), undefined, 1), ["p2"]);
  assert.deepStrictEqual(selectRange(demoPages(), null, 6), ["p7"]);
});

test("selectRange with unknown anchor starts at the target index", (t) => {
  assert.deepStrictEqual(selectRange(demoPages(), "p99", 1), ["p2"]);
});

test("clampSelection drops ids that no longer exist", (t) => {
  assert.deepStrictEqual(clampSelection(["p1", "p2", "p99"], demoPages()), [
    "p1",
    "p2",
  ]);
  assert.deepStrictEqual(clampSelection(["p1", "p2"], []), []);
});

test("clampSelection normalizes ids with String()", (t) => {
  assert.deepStrictEqual(clampSelection(["1", 99], numericPages()), ["1"]);
  assert.deepStrictEqual(clampSelection([1, 2, "99"], numericPages()), [1, 2]);
});

test("rotateSelected adds 90 degrees and wraps at 360", (t) => {
  const rotated = rotateSelected(demoPages(), ["p1", "p3"]);
  assert.equal(rotated[0].rotated, 90);
  assert.equal(rotated[1].rotated, 0);
  assert.equal(rotated[2].rotated, 90);

  const wrapped = rotateSelected([page("p1", 270)], ["p1"]);
  assert.equal(wrapped[0].rotated, 0);
});

test("rotateSelected only rotates selected pages", (t) => {
  const rotated = rotateSelected(demoPages(), ["p2"]);
  assert.equal(rotated[0].rotated, 0);
  assert.equal(rotated[1].rotated, 90);
  assert.equal(rotated[2].rotated, 0);
});

test("rotateSelected acts on a page selected by string id", (t) => {
  const selected = toggleSelection([], "p4");
  const rotated = rotateSelected(demoPages(), selected);
  assert.equal(rotated[0].rotated, 0);
  assert.equal(rotated[1].rotated, 0);
  assert.equal(rotated[2].rotated, 0);
  assert.equal(rotated[3].rotated, 90);
});

test("duplicateSelected inserts duplicates after their originals", (t) => {
  const { pages: next, dupes, nextId } = duplicateSelected(demoPages(), ["p1", "p3"], 8);
  assert.deepStrictEqual(next.map((p) => p.id), [
    "p1",
    "p8",
    "p2",
    "p3",
    "p9",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
  assert.deepStrictEqual(dupes.map((d) => d.id), ["p8", "p9"]);
  assert.deepStrictEqual(dupes.map((d) => d.rotated), [0, 0]);
  assert.equal(nextId, 10);
});

test("duplicateSelected makes the duplicates the selection", (t) => {
  const { pages: next, dupes } = duplicateSelected(demoPages(), ["p2"], 8);
  assert.deepStrictEqual(dupes.map((d) => d.id), ["p8"]);
  assert.ok(next.find((p) => p.id === "p8"));
});

test("duplicateSelected with empty selection adds nothing", (t) => {
  const { pages: next, dupes, nextId } = duplicateSelected(demoPages(), [], 8);
  assert.deepStrictEqual(next.map((p) => p.id), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
  assert.deepStrictEqual(dupes, []);
  assert.equal(nextId, 8);
});

test("duplicateSelected duplicating the last page appends it", (t) => {
  const { pages: next, dupes } = duplicateSelected(demoPages(), ["p7"], 8);
  assert.deepStrictEqual(next.map((p) => p.id), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
    "p8",
  ]);
  assert.deepStrictEqual(dupes.map((d) => d.id), ["p8"]);
});

test("duplicateSelected acts on a page selected by string id", (t) => {
  const selected = toggleSelection([], "p5");
  const { pages: next, dupes } = duplicateSelected(demoPages(), selected, 8);
  assert.deepStrictEqual(dupes.map((d) => d.id), ["p8"]);
  assert.deepStrictEqual(next.map((p) => p.id), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p8",
    "p6",
    "p7",
  ]);
});

test("deleteSelected removes only selected pages", (t) => {
  assert.deepStrictEqual(deleteSelected(demoPages(), ["p2"]).map((p) => p.id), [
    "p1",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
});

test("deleteSelected with empty selection removes nothing", (t) => {
  assert.deepStrictEqual(deleteSelected(demoPages(), []).map((p) => p.id), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
});

test("deleteSelected deleting all pages returns an empty list", (t) => {
  assert.deepStrictEqual(deleteSelected(demoPages(), ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]), []);
});

test("deleteSelected ignores unknown ids", (t) => {
  assert.deepStrictEqual(deleteSelected(demoPages(), ["p99"]).map((p) => p.id), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
});

test("deleteSelected acts on a page selected by string id", (t) => {
  const selected = toggleSelection([], "p3");
  assert.deepStrictEqual(deleteSelected(demoPages(), selected).map((p) => p.id), [
    "p1",
    "p2",
    "p4",
    "p5",
    "p6",
    "p7",
  ]);
});

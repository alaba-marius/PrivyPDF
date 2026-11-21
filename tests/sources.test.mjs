import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSource,
  getSource,
  removeSource,
  sourceCount,
  totalPages,
  totalBytes,
  clearSources,
} from "../js/core/sources.js";

test("sources registry stores sources by id and returns them", (t) => {
  clearSources();
  const a = createSource({
    kind: "pdf",
    bytes: new Uint8Array([1, 2, 3]),
    size: 3,
    pageCount: 2,
  });
  const b = createSource({ kind: "image", bytes: new Uint8Array([4]), size: 1, pageCount: 1 });
  assert.equal(sourceCount(), 2);
  assert.equal(getSource(a.id).kind, "pdf");
  assert.equal(getSource(a.id).pageCount, 2);
  assert.equal(getSource(b.id).kind, "image");
  assert.equal(getSource(b.id).pageCount, 1);
  assert.equal(getSource("missing"), undefined);
});

test("removeSource drops a source and totals recompute over the rest", (t) => {
  clearSources();
  const a = createSource({ kind: "pdf", bytes: new Uint8Array([1]), size: 10, pageCount: 4 });
  createSource({ kind: "image", bytes: new Uint8Array([2]), size: 20, pageCount: 1 });
  assert.equal(sourceCount(), 2);
  assert.equal(totalPages(), 5);
  assert.equal(totalBytes(), 30);
  removeSource(a.id);
  assert.equal(sourceCount(), 1);
  assert.equal(getSource(a.id), undefined);
  assert.equal(totalPages(), 1);
  assert.equal(totalBytes(), 20);
  clearSources();
  assert.equal(sourceCount(), 0);
  assert.equal(totalPages(), 0);
  assert.equal(totalBytes(), 0);
});

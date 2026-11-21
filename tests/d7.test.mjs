import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

const cards = read("js/ui/cards.js");
const editorCss = read("css/editor.css");

test("the lazy-thumbnail IntersectionObserver does not use the grid element as its root", (t) => {
  assert.ok(/new IntersectionObserver\(/.test(cards), "cards.js sets up an IntersectionObserver");
  assert.ok(
    !/root:\s*gridEl\b/.test(cards),
    "the observer root is not gridEl (#page-grid) — the grid is the tall non-scrolling container, not the scroll container",
  );
});

test("the lazy-thumbnail observer root is the scroll container passed into mountGrid", (t) => {
  assert.ok(
    /closest\("#grid-wrap"\)/.test(cards),
    "mountGrid resolves the observer root as the nearest #grid-wrap scroll ancestor",
  );
  assert.ok(
    /root:\s*scrollEl/.test(cards),
    "the IntersectionObserver options use the resolved scroll container as its root",
  );
});

test("the observer root (#grid-wrap) is a scroll container in css/editor.css", (t) => {
  const start = editorCss.indexOf(".grid-wrap");
  assert.ok(start !== -1, "editor.css defines .grid-wrap");
  const open = editorCss.indexOf("{", start);
  let depth = 0;
  let block = "";
  for (let i = open; i < editorCss.length; i++) {
    if (editorCss[i] === "{") depth++;
    else if (editorCss[i] === "}") {
      depth--;
      if (depth === 0) {
        block = editorCss.slice(open + 1, i);
        break;
      }
    }
  }
  assert.ok(block.length > 0, "#grid-wrap rule block could not be parsed");
  assert.ok(
    /overflow-y:\s*(auto|scroll)/.test(block),
    "#grid-wrap sets overflow-y: auto or scroll (it is the observer root's scroll container)",
  );
});

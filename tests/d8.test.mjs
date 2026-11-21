// Static checks for the Phase 2 rail / float-bar wiring and for copy that must
// no longer appear on any shipped page. Reads files as text — no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

const editor = read("js/editor.js");
const pages = {
  "index.html": read("index.html"),
  "privacy.html": read("privacy.html"),
  "editor.html": read("editor.html"),
};

test("rail-merge opens the file chooser with PDF-only accept", () => {
  assert.ok(
    /["']rail-merge["'][\s\S]{0,300}?pickFiles\([\s\S]{0,200}?accept:\s*["']application\/pdf,\.pdf["']/.test(editor),
    "rail-merge calls pickFiles with accept application/pdf,.pdf",
  );
});

test("rail-images opens the file chooser with image accept", () => {
  assert.ok(
    /["']rail-images["'][\s\S]{0,300}?pickFiles\([\s\S]{0,200}?accept:\s*["']image\/jpeg,image\/png,\.jpg,\.jpeg,\.png["']/.test(editor),
    "rail-images calls pickFiles with accept image/jpeg,image/png,.jpg,.jpeg,.png",
  );
});

test("rail-extract and float-extract are wired to the extract action", () => {
  assert.ok(/function extractSelected\(\)/.test(editor), "extractSelected is defined");
  assert.ok(
    /["']rail-extract["'][\s\S]{0,300}?addEventListener\(\s*["']click["']\s*,\s*extractSelected\)/.test(editor),
    "rail-extract calls extractSelected",
  );
  assert.ok(
    /mountFloatBar\(\$\(["']float-bar["']\)[\s\S]{0,300}?onExtract:\s*extractSelected/.test(editor),
    "the float bar's Extract calls extractSelected",
  );
  assert.ok(!/Coming in the next phase/.test(editor), "no 'next phase' toast remains in js/editor.js");
});

test("no shipped page contains the removed copy", () => {
  for (const [page, html] of Object.entries(pages)) {
    assert.ok(!/Coming in the next phase/.test(html), `${page} contains "Coming in the next phase"`);
    assert.ok(!/start editing/.test(html), `${page} contains "start editing"`);
    assert.ok(!/interactive demo/.test(html), `${page} contains "interactive demo"`);
  }
});

test("the four live tool cards have no Soon badge", () => {
  const html = pages["index.html"];
  const start = html.indexOf('<div class="ds-tools-grid">');
  assert.ok(start !== -1, "index.html has a tools grid");
  const end = html.indexOf("</section>", start);
  const grid = html.slice(start, end);
  assert.ok(/<span class="ds-tool-title">Organize pages<\/span>/.test(grid), "Organize pages card");
  assert.ok(/<span class="ds-tool-title">Merge PDFs<\/span>/.test(grid), "Merge PDFs card");
  assert.ok(/<span class="ds-tool-title">Images to PDF<\/span>/.test(grid), "Images to PDF card");
  assert.ok(/<span class="ds-tool-title">Extract pages<\/span>/.test(grid), "Extract pages card");
  assert.ok(!/Extract\s*&\s*split/.test(grid), "the 'Extract & split' name is gone");
  assert.ok(!/ds-tools-grid[\s\S]{0,2000}?ds-badge-soon/.test(grid), "no Soon badge on the four live tool cards");
  // Annotate and Compress & protect stay Soon.
  assert.ok(/<span class="ds-tool-title">Annotate<\/span>/.test(grid));
  assert.ok(/<span class="ds-tool-title">Compress &amp; protect<\/span>/.test(grid));
  const soonCount = (grid.match(/ds-badge-soon/g) || []).length;
  assert.equal(soonCount, 2, "only Annotate and Compress & protect keep Soon badges");
});

test("the Page tools row lost its Soon badge", () => {
  const html = pages["index.html"];
  const start = html.indexOf('<div class="ds-feature-row ds-feature-row--first">');
  assert.ok(start !== -1, "feature row 1 exists");
  const end = html.indexOf("</section>", start);
  const row = html.slice(start, end);
  assert.ok(/<span class="ds-feature-label">Page tools<\/span>/.test(row));
  assert.ok(!/<span class="ds-feature-label">Page tools<\/span>[\s\S]{0,200}?ds-badge-soon/.test(row), "Page tools keeps no Soon badge");
  assert.ok(/Open the editor/.test(row), "the row button still opens the editor");
});

test("tool descriptions match the real behavior", () => {
  const html = pages["index.html"];
  assert.ok(/Add several PDFs, put the pages in order and download one file\./.test(html));
  assert.ok(/Add JPG or PNG photos or scans and each one becomes a page\./.test(html));
  assert.ok(/Select pages and download them as a separate PDF\./.test(html));
  assert.ok(
    /Select, rotate, duplicate and delete pages, drag them into a new order and undo any step\./.test(html),
  );
});

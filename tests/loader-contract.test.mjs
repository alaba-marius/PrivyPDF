// Contract for how js/editor.js loads pdf.js: by dynamic import of the
// vendored ES module (never by injecting a classic <script>), with the worker
// set to the same-origin vendored worker so the strict CSP stays satisfied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const editor = readFileSync(join(ROOT, "js/editor.js"), "utf8");

test("editor.js loads pdf.js by dynamic import of the vendored ES module", () => {
  assert.ok(
    /import\s*\(\s*["']\/vendor\/pdfjs\/pdf\.min\.js["']\s*\)/.test(editor),
    "editor.js dynamically imports /vendor/pdfjs/pdf.min.js",
  );
});

test("editor.js no longer injects pdf.js through a classic script tag", () => {
  assert.ok(!/document\.createElement\s*\(\s*["']script["']/.test(editor), "no script injection");
  assert.ok(
    !/script\.src\s*=\s*["']\/vendor\/pdfjs\/pdf\.min\.js["']/.test(editor),
    "no pdf.js script src assignment",
  );
  assert.ok(/let pdfjsLib;/.test(editor), "pdfjsLib is a module-scoped variable, not a script-injected global");
});

test("editor.js routes the pdf.js worker through the same-origin vendored bundle", () => {
  assert.ok(
    /GlobalWorkerOptions\.workerSrc\s*=\s*["']\/vendor\/pdfjs\/pdf\.worker\.min\.js["']/.test(editor),
    "GlobalWorkerOptions.workerSrc is the vendored worker",
  );
});

test("the vendored pdf.min.js is a real ES module (has exports)", () => {
  const pdf = readFileSync(join(ROOT, "vendor", "pdfjs", "pdf.min.js"), "utf8");
  assert.ok(/\bexport\b/.test(pdf), "pdf.min.js contains export statements");
  assert.ok(pdf.length > 10000, "pdf.min.js is the real bundle, not a stub");
});

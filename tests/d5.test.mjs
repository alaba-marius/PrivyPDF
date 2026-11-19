import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

const theme = read("css/theme.css");
const editorCss = read("css/editor.css");
const pages = {
  "index.html": read("index.html"),
  "privacy.html": read("privacy.html"),
  "editor.html": read("editor.html"),
};
const designSystem = read("design-system.html");
const vercelIgnore = read(".vercelignore");
const dockerIgnore = read(".dockerignore");

// Entries of an ignore file: one token per line, blank lines and comments dropped.
function entriesOf(ignoreFile) {
  return ignoreFile.split(/\s+/).filter((line) => line.length > 0 && !line.startsWith("#"));
}

function cssBlock(css, selector, from = 0) {
  const start = css.indexOf(selector, from);
  assert.ok(start !== -1, `css defines ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  assert.fail(`unclosed rule for ${selector}`);
}

const IGNORED = [
  ".git", ".github", "node_modules", "tests", "scripts", "Dockerfile",
  ".dockerignore", "README.md", "REPORT.md", "DESIGN.md", "design-system.html", "_headers",
  ".claude", ".impeccable",
];

test("css/theme.css defines the centered stack modifier", (t) => {
  const block = cssBlock(theme, ".ds-stack--center {");
  assert.ok(/align-items:\s*center/.test(block), "ds-stack--center sets align-items: center");
  assert.ok(/text-align:\s*center/.test(block), "ds-stack--center sets text-align: center");
});

test("the hero stack uses the centered modifier so the guarantee line centers under the buttons", (t) => {
  const html = pages["index.html"];
  assert.ok(
    /<div class="ds-stack ds-stack--md ds-stack--center">/.test(html),
    "hero stack has ds-stack--center",
  );
  assert.ok(/<p class="ds-text-body-small ds-hero-signoff">/.test(html), "hero guarantee line keeps its class");
  assert.ok(/No uploads\. No accounts or tracking\./.test(html), "hero guarantee line copy unchanged");
});

test("the band keeps its full-bleed background and starts content at the container edge", (t) => {
  const block = cssBlock(theme, ".ds-band {");
  assert.ok(/padding:\s*96px\s*0/.test(block), "band padding is 96px 0 — full-bleed background, no extra horizontal padding");
  const html = pages["index.html"];
  assert.ok(
    /<section class="ds-band[\s\S]*?<div class="ds-container">/.test(html),
    "band inner content uses ds-container",
  );
  assert.ok(
    /<section class="ds-band[\s\S]*?<div class="ds-band-text">[\s\S]*?<h2>Verify it yourself in a minute\./.test(html),
    "band heading starts at the container's left edge",
  );
});

test("the hero sheet grid is repeat(3, 1fr) with one gap value", (t) => {
  const sheets = cssBlock(theme, ".ds-hero-sheets {");
  assert.ok(/grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(sheets), "hero grid is repeat(3, 1fr)");
  assert.strictEqual(sheets.match(/gap:/g).length, 1, "hero grid declares a single gap");
  assert.ok(/gap:\s*16px/.test(sheets), "hero gap is 16px");
});

test("the selected hero sheet stays the same size as the others", (t) => {
  const sel = cssBlock(theme, ".ds-hero-sheet--selected {");
  assert.ok(/outline:\s*2px solid/.test(sel), "selection ring is an outline");
  assert.ok(/outline-offset:\s*-2px/.test(sel), "outline is inset (outline-offset: -2px), not outside the sheet");
});

test("the hero floatbar stays one centered nowrap line", (t) => {
  const bar = cssBlock(theme, ".ds-hero-floatbar {");
  assert.ok(/white-space:\s*nowrap/.test(bar), "floatbar does not wrap");
  assert.ok(/width:\s*max-content/.test(bar), "floatbar is content-sized");
});

test("the Document input has a programmatic label", (t) => {
  const html = pages["editor.html"];
  assert.ok(
    /<label for="doc-name" class="panel-label ds-panel-label">Document<\/label>/.test(html),
    '"Document" is a <label for="doc-name"> with the same classes and unchanged text',
  );
  assert.ok(
    /<input class="ds-input" id="doc-name" type="text" \/>/.test(html),
    "#doc-name is still a plain text input",
  );
});

test("Soon labels are at least 11px everywhere", (t) => {
  const desktop = cssBlock(theme, ".ds-rail-soon {");
  assert.ok(/font-size:\s*11px/.test(desktop), ".ds-rail-soon (desktop rail) is 11px");
  const phone = cssBlock(editorCss, "#rail .rail-soon {");
  assert.ok(/font-size:\s*11px/.test(phone), "#rail .rail-soon (phone rail) is 11px");
  const sizes = [
    ...theme.matchAll(/font-size:\s*([0-9.]+)px/g),
    ...editorCss.matchAll(/font-size:\s*([0-9.]+)px/g),
  ].map((m) => Number(m[1]));
  assert.ok(sizes.every((size) => size >= 11), `no font-size below 11px (smallest: ${Math.min(...sizes)}px)`);
});

test("editor panel sections stack with a real gap instead of one-off margins", (t) => {
  const section = cssBlock(editorCss, ".ds-panel-section {");
  assert.ok(/--stack-gap:\s*12px/.test(section), ".ds-panel-section sets --stack-gap: 12px (label-to-control and segmented-to-button)");
  assert.ok(/padding:\s*20px/.test(cssBlock(theme, ".ds-panel-section {")), ".ds-panel-section keeps 20px section padding");
  assert.ok(!editorCss.includes(".panel-label {"), ".panel-label has no margin rule — spacing from its control comes from the section gap");
  const segmented = cssBlock(editorCss, ".right-panel .ds-segmented {");
  assert.ok(!/margin-bottom/.test(segmented), ".right-panel .ds-segmented has no margin-bottom");
  assert.ok(/width:\s*100%/.test(segmented), ".right-panel .ds-segmented stays full width");
  const stack = cssBlock(theme, ".ds-stack--sm {");
  assert.ok(/--stack-gap:\s*8px/.test(stack), "ds-stack--sm keeps the standard 8px gap (button to caption)");
  const html = pages["editor.html"];
  assert.ok(
    /<label for="doc-name" class="panel-label ds-panel-label">Document<\/label>[\s\S]*?<div class="file-field">/.test(html),
    'Document label sits above its control in a 12px-gap section',
  );
  assert.ok(
    /<div class="ds-stack ds-stack--sm panel-section ds-panel-section">[\s\S]*?<span class="panel-label ds-panel-label">Export<\/span>[\s\S]*?<div class="ds-segmented">[\s\S]*?<\/div>[\s\S]*?<div class="ds-stack ds-stack--sm export-actions">[\s\S]*?<button class="ds-btn ds-btn--primary" id="download-pdf">[\s\S]*?<\/button>[\s\S]*?<p class="export-caption">Built in this tab\. Nothing is uploaded\.<\/p>[\s\S]*?<\/div>/.test(html),
    'Export section: label, segmented control, then button and caption nested in an 8px stack (segmented-to-button 12px from the section gap, button-to-caption 8px)',
  );
});

test("proof rows have a vertical inset and keep their 1px top borders", (t) => {
  const row = cssBlock(theme, ".ds-proof-row {");
  assert.ok(/padding-block:\s*10px/.test(row), ".ds-proof-row padding-block: 10px");
  assert.ok(/border-top:\s*1px solid/.test(row), ".ds-proof-row keeps its 1px top border lines");
  assert.ok(/border-top:\s*0/.test(cssBlock(theme, ".ds-proof-row:first-child {")), "the first proof row keeps border-top: 0");
  for (const page of ["index.html", "privacy.html"]) {
    assert.ok(/<div class="ds-proof-row">/.test(pages[page]), `${page} keeps its proof rows`);
  }
});

test(".vercelignore excludes dev-only files from deployment", (t) => {
  const entries = entriesOf(vercelIgnore);
  for (const entry of IGNORED) {
    assert.ok(entries.includes(entry), `.vercelignore excludes ${entry}`);
  }
});

test(".dockerignore excludes dev-only files from the nginx image", (t) => {
  const entries = entriesOf(dockerIgnore);
  for (const entry of IGNORED) {
    assert.ok(entries.includes(entry), `.dockerignore excludes ${entry}`);
  }
});

test("no public page links to design-system.html, DESIGN.md or REPORT.md", (t) => {
  for (const [page, html] of Object.entries(pages)) {
    assert.ok(!html.includes("design-system.html"), `${page} links to design-system.html`);
    assert.ok(!html.includes("DESIGN.md"), `${page} links to DESIGN.md`);
    assert.ok(!html.includes("REPORT.md"), `${page} links to REPORT.md`);
  }
});

test("design-system.html is marked dev-only and excluded from deployment", (t) => {
  assert.ok(
    designSystem.includes("Dev-only style guide, desktop layout only; not deployed"),
    "design-system.html carries the dev-only note",
  );
  assert.ok(entriesOf(vercelIgnore).includes("design-system.html"), "design-system.html is in .vercelignore");
  assert.ok(entriesOf(dockerIgnore).includes("design-system.html"), "design-system.html is in .dockerignore");
});

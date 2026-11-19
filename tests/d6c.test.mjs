import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

const theme = read("css/theme.css");
const pages = {
  "index.html": read("index.html"),
  "editor.html": read("editor.html"),
};

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

test("ds-stack--start and ds-stack--center modifiers exist", (t) => {
  const start = cssBlock(theme, ".ds-stack--start {");
  assert.ok(/align-items:\s*flex-start/.test(start), "ds-stack--start sets align-items: flex-start");
  const center = cssBlock(theme, ".ds-stack--center {");
  assert.ok(/align-items:\s*center/.test(center), "ds-stack--center sets align-items: center");
  assert.ok(/text-align:\s*center/.test(center), "ds-stack--center sets text-align: center");
});

test(".ds-stat-row spans full width with label left and value right, rows 4px apart", (t) => {
  const row = cssBlock(theme, ".ds-stat-row {");
  assert.ok(/display:\s*flex/.test(row), ".ds-stat-row is flex");
  assert.ok(/justify-content:\s*space-between/.test(row), "label left, value right");
  assert.ok(/width:\s*100%/.test(row), ".ds-stat-row width: 100%");
  const group = cssBlock(theme, ".ds-stat-group {");
  assert.ok(/flex-direction:\s*column/.test(group), ".ds-stat-group stacks its rows");
  assert.ok(/gap:\s*4px/.test(group), ".ds-stat-group rows are 4px apart");
  const html = pages["editor.html"];
  assert.ok(
    /<div class="ds-stat-group">[\s\S]*?<div class="ds-stat-row">[\s\S]*?<div class="ds-stat-row">[\s\S]*?<div class="ds-stat-row">/.test(html),
    "three stat rows are wrapped in ds-stat-group",
  );
});

test("facts strip is a centered horizontal row", (t) => {
  const facts = cssBlock(theme, ".ds-facts {");
  assert.ok(/display:\s*flex/.test(facts), ".ds-facts is display: flex");
  assert.ok(!/flex-direction:\s*column/.test(facts), ".ds-facts is a row, not a column");
  assert.ok(/justify-content:\s*center/.test(facts), ".ds-facts justify-content: center");
  assert.ok(/flex-wrap:\s*wrap/.test(facts), ".ds-facts wraps");
  assert.ok(/gap:\s*56px/.test(facts), ".ds-facts gap: 56px");
  const html = pages["index.html"];
  assert.ok(/<div class="ds-container ds-facts">/.test(html), "fact items are direct children of the ds-facts container");
  assert.ok(
    /<div class="ds-fact">[\s\S]*?<div class="ds-fact">[\s\S]*?<div class="ds-fact">[\s\S]*?<div class="ds-fact">/.test(html),
    "four fact items are present",
  );
});

test("card grids are three equal columns spanning the container", (t) => {
  const cardGrid = cssBlock(theme, ".ds-card-grid {");
  assert.ok(/display:\s*grid/.test(cardGrid), "ds-card-grid is display: grid");
  assert.ok(/grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(cardGrid), "ds-card-grid is repeat(3, 1fr)");
  assert.ok(/gap:\s*24px/.test(cardGrid), "ds-card-grid gap: 24px");
  const toolsGrid = cssBlock(theme, ".ds-tools-grid {");
  assert.ok(/grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(toolsGrid), "ds-tools-grid is repeat(3, 1fr)");
  const desktop = theme.slice(theme.indexOf("@media (min-width: 900px)"));
  assert.ok(/margin-block-start:\s*48px/.test(desktop), "desktop card grids widen to 48px");
});

test("card grids stack to one column below 900px", (t) => {
  const below900 = theme.slice(theme.indexOf("@media (max-width: 899px)"));
  assert.ok(/ds-card-grid/.test(below900) && /ds-tools-grid/.test(below900), "card grids appear in the 900px breakpoint");
  assert.ok(/grid-template-columns:\s*1fr/.test(below900), "card grids are one column below 900px");
});

test("hero drop zone order is icon, title, hint, badge", (t) => {
  const html = pages["index.html"];
  const start = html.indexOf('id="hero-drop"');
  const end = html.indexOf("</section>", start);
  const drop = html.slice(start, end);
  const icon = drop.indexOf("dropzone-icon");
  const title = drop.indexOf("dropzone-title");
  const hint = drop.indexOf("dropzone-hint");
  const badge = drop.indexOf('class="ds-badge-light"');
  assert.ok(icon !== -1 && title !== -1 && hint !== -1 && badge !== -1, "all four drop zone parts are present");
  assert.ok(icon < title && title < hint && hint < badge, "drop zone order is icon, title, hint, badge");
});

test("hero drop zone is a rounded dashed card with wide padding below the window", (t) => {
  const hero = cssBlock(theme, ".ds-dropzone--hero {");
  assert.ok(/border-radius:\s*16px/.test(hero), "drop zone radius: 16px");
  assert.ok(/padding:\s*56px\s*32px/.test(hero), "drop zone padding: 56px 32px");
  assert.ok(/border:\s*1\.5px dashed/.test(hero), "drop zone keeps a dashed border");
  assert.ok(/margin-top:\s*16px/.test(hero), "drop zone is 16px below the mini window");
});

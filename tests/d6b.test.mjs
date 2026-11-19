import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
  "design-system.html": read("design-system.html"),
};

const jsFiles = readdirSync(join(ROOT, "js")).filter((f) => f.endsWith(".js")).sort();

// Extract every class="..." / class='...' token list from a piece of text
// (HTML markup or a JS template literal that emits class attributes).
function classTokenLists(text) {
  const lists = [];
  for (const m of text.matchAll(/class\s*=\s*["']([^"']*)["']/gi)) {
    lists.push(m[1].split(/\s+/).filter((t) => t.length > 0));
  }
  return lists;
}

const STACK_MODIFIER = /^ds-stack--\w+$/;

function orphanModifiers(tokens) {
  return tokens.filter((tok) => STACK_MODIFIER.test(tok) && !tokens.includes("ds-stack"));
}

// Returns the body of the shared stack rule whose selector list begins with
// `startSelector` (e.g. ".ds-stack," covers every ds-stack--* modifier too).
function sharedStackBlock(css, startSelector) {
  const start = css.indexOf(startSelector);
  assert.ok(start !== -1, `css defines ${startSelector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  assert.fail(`unclosed shared stack rule starting at ${startSelector}`);
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

test("no ds-stack--* modifier is used without the ds-stack base class", (t) => {
  const problems = [];
  for (const [name, text] of Object.entries(pages)) {
    for (const tokens of classTokenLists(text)) {
      const bad = orphanModifiers(tokens);
      if (bad.length) problems.push(`${name}: ${bad.join(", ")}`);
    }
  }
  for (const file of jsFiles) {
    for (const tokens of classTokenLists(read(`js/${file}`))) {
      const bad = orphanModifiers(tokens);
      if (bad.length) problems.push(`js/${file}: ${bad.join(", ")}`);
    }
  }
  assert.deepStrictEqual(
    problems,
    [],
    "every ds-stack--* modifier must appear with the ds-stack base class: " + problems.join("; "),
  );
});

test("css/theme.css makes every ds-stack--* modifier standalone-safe", (t) => {
  // The shared rule gives every modifier (and the base class) flex-column
  // layout, so a modifier used alone no longer collapses to a 0px gap.
  const shared = sharedStackBlock(theme, ".ds-stack--sm,");
  assert.ok(/display:\s*flex/.test(shared), "shared stack rule sets display: flex");
  assert.ok(/flex-direction:\s*column/.test(shared), "shared stack rule sets flex-direction: column");
  assert.ok(/gap:\s*var\(--stack-gap,\s*16px\)/.test(shared), "shared stack rule sets gap: var(--stack-gap, 16px)");
  assert.ok(/align-items:\s*stretch/.test(shared), "shared stack rule sets align-items: stretch");
  // Each modifier then sets only its own gap or its centering.
  assert.ok(/--stack-gap:\s*8px/.test(cssBlock(theme, ".ds-stack--sm {")), "ds-stack--sm is 8px");
  assert.ok(/--stack-gap:\s*16px/.test(cssBlock(theme, ".ds-stack--md {")), "ds-stack--md is 16px");
  assert.ok(/--stack-gap:\s*32px/.test(cssBlock(theme, ".ds-stack--lg {")), "ds-stack--lg is 32px");
  const center = cssBlock(theme, ".ds-stack--center {");
  assert.ok(/align-items:\s*center/.test(center), "ds-stack--center centers cross-axis");
  assert.ok(/text-align:\s*center/.test(center), "ds-stack--center centers inline content");
});

test("panel label-to-control and segmented-to-button gap is 12px from the section stack", (t) => {
  const section = cssBlock(editorCss, ".ds-panel-section {");
  assert.ok(/--stack-gap:\s*12px/.test(section), ".ds-panel-section sets --stack-gap: 12px (label to control and segmented control to button)");
});

test("panel button-to-caption gap is 8px from the nested export-actions stack", (t) => {
  const sm = cssBlock(theme, ".ds-stack--sm {");
  assert.ok(/--stack-gap:\s*8px/.test(sm), "ds-stack--sm is 8px (Download PDF button to its caption)");
});

test("panel section padding stays 20px", (t) => {
  const section = cssBlock(theme, ".ds-panel-section {");
  assert.ok(/padding:\s*20px/.test(section), ".ds-panel-section keeps padding: 20px");
});

test("Download PDF button and Export segmented span the full section width", (t) => {
  assert.ok(/#download-pdf\s*\{\s*[\s\S]*?width:\s*100%/.test(editorCss), "#download-pdf is width: 100%");
  const seg = cssBlock(editorCss, ".right-panel .ds-segmented {");
  assert.ok(/width:\s*100%/.test(seg), ".right-panel .ds-segmented is width: 100%");
});

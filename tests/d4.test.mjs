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
  "design-system.html": read("design-system.html"),
  "editor.html": read("editor.html"),
};

// Body copy of a page: <title>, <meta>, <pre> and <code> removed, then tags
// stripped. Placeholder dashes in editor stat tiles are UI chrome, not copy.
function bodyCopy(html) {
  let text = html
    .replace(/<title[\s\S]*?<\/title>/gi, " ")
    .replace(/<meta[^>]*>/gi, " ")
    .replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<span class="ds-stat-value"[^>]*>—<\/span>/g, " ");
  return text.replace(/<[^>]*>/g, " ");
}

// Body of the first top-level rule whose selector starts at `selector`
// (searching from `from`, default 0).
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

// Body of the shared stack rule whose selector list begins with `startSelector`
// (e.g. ".ds-stack," covers every ds-stack--* modifier alongside the base class).
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

test("css/theme.css defines the vertical-rhythm stack utilities", (t) => {
  const stack = sharedStackBlock(theme, ".ds-stack--sm,");
  assert.ok(/display:\s*flex/.test(stack), "ds-stack is display: flex");
  assert.ok(/flex-direction:\s*column/.test(stack), "ds-stack direction is column");
  assert.ok(/gap:\s*var\(--stack-gap/.test(stack), "ds-stack uses --stack-gap");
  assert.ok(/\.ds-stack--sm\s*\{\s*--stack-gap:\s*8px/.test(theme), "ds-stack--sm is 8px");
  assert.ok(/\.ds-stack--md\s*\{\s*--stack-gap:\s*16px/.test(theme), "ds-stack--md is 16px");
  assert.ok(/\.ds-stack--lg\s*\{\s*--stack-gap:\s*32px/.test(theme), "ds-stack--lg is 32px");
});

test("a.ds-btn keeps text-decoration: none in every state", (t) => {
  const base = cssBlock(theme, ".ds-btn {");
  assert.ok(/text-decoration:\s*none/.test(base), ".ds-btn base sets text-decoration: none");
  assert.ok(!/text-decoration:\s*underline/.test(base), ".ds-btn base must not underline");
  const states = theme.slice(theme.indexOf(".ds-btn:hover"));
  const stateBlock = states.slice(0, states.indexOf("}") + 1);
  assert.ok(stateBlock.includes(".ds-btn:hover"), "defines .ds-btn:hover");
  assert.ok(stateBlock.includes(".ds-btn:focus-visible"), "defines .ds-btn:focus-visible");
  assert.ok(stateBlock.includes(".ds-btn:visited"), "defines .ds-btn:visited");
  assert.ok(/text-decoration:\s*none/.test(stateBlock), "button states set text-decoration: none");
  assert.ok(!/text-decoration:\s*underline/.test(stateBlock), "button states must not underline");
  // No rule touching .ds-btn anywhere reintroduces an underline.
  for (const match of theme.matchAll(/(^|\n)[^{]*\.ds-btn[^{]*\{[\s\S]*?\}/g)) {
    assert.ok(!/text-decoration:\s*underline/.test(match[0]), `underline found in: ${match[0].slice(0, 80)}`);
  }
});

test("ds-card stacks label, title and text with an 8px gap", (t) => {
  const block = cssBlock(theme, ".ds-card {");
  assert.ok(/display:\s*flex/.test(block) && /flex-direction:\s*column/.test(block), "ds-card is a column flex container");
  assert.ok(/gap:\s*8px/.test(block), "ds-card gap is 8px");
});

test("card grids keep the 32px gap (48px on desktop)", (t) => {
  assert.ok(/margin-block-start:\s*32px/.test(cssBlock(theme, ".ds-card-grid {")), "ds-card-grid gap 32px");
  assert.ok(/margin-block-start:\s*32px/.test(cssBlock(theme, ".ds-tools-grid {")), "ds-tools-grid gap 32px");
  const promiseBodies = [];
  for (const match of theme.matchAll(/\.ds-promise-grid\s*\{([\s\S]*?)\}/g)) promiseBodies.push(match[1]);
  assert.ok(promiseBodies.some((body) => /margin-block-start:\s*32px/.test(body)), "ds-promise-grid gap 32px");
  const desktop = theme.slice(theme.indexOf("@media (min-width: 900px)"));
  assert.ok(/ds-card-grid/.test(desktop) && /ds-tools-grid/.test(desktop) && /ds-promise-grid/.test(desktop), "desktop card grids widen to 48px");
  assert.ok(/margin-block-start:\s*48px/.test(desktop), "desktop card-grid gap is 48px");
});

test("#empty-drop is a centered card with max-width, padding and gap", (t) => {
  const block = cssBlock(editorCss, "#empty-drop {");
  assert.ok(/max-width:\s*560px/.test(block), "max-width: 560px");
  assert.ok(/width:\s*calc\(100%\s*-\s*64px\)/.test(block), "width: calc(100% - 64px)");
  assert.ok(/padding:\s*56px\s*32px/.test(block), "padding: 56px 32px");
  assert.ok(/min-height:\s*280px/.test(block), "min-height: 280px");
  assert.ok(/border-radius:\s*16px/.test(block), "border-radius: 16px");
  assert.ok(/background:\s*#fff/.test(block), "background: #fff");
  assert.ok(/display:\s*flex/.test(block) && /flex-direction:\s*column/.test(block), "flex column container");
  assert.ok(/align-items:\s*center/.test(block), "align-items: center");
  assert.ok(/gap:\s*16px/.test(block), "gap: 16px");
  const dropzone = cssBlock(theme, ".ds-dropzone {");
  assert.ok(/border:\s*1\.5px dashed rgba\(22,\s*22,\s*24,\s*0\.25\)/.test(dropzone), "dropzone keeps the dashed rgba border");
});

test("#empty-state centers #empty-drop both ways inside the workarea", (t) => {
  const block = cssBlock(editorCss, "#empty-state {");
  assert.ok(/display:\s*flex/.test(block), "#empty-state is display: flex");
  assert.ok(/align-items:\s*center/.test(block), "centers vertically");
  assert.ok(/justify-content:\s*center/.test(block), "centers horizontally");
  assert.ok(/min-height:\s*calc\(100dvh/.test(block), "min-height is a share of the viewport");
});

const phoneStart = editorCss.lastIndexOf("@media (max-width: 699px)");
test("#empty-drop shrinks to calc(100% - 32px) and 40px 20px padding on phones", (t) => {
  assert.ok(phoneStart !== -1, "editor.css has a 700px breakpoint");
  let depth = 0;
  const open = editorCss.indexOf("{", phoneStart);
  let end = open;
  for (; end < editorCss.length; end++) {
    if (editorCss[end] === "{") depth++;
    else if (editorCss[end] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const phone = editorCss.slice(open + 1, end);
  assert.ok(/#empty-drop\s*\{[\s\S]*?width:\s*calc\(100%\s*-\s*32px\)/.test(phone), "phone width: calc(100% - 32px)");
  assert.ok(/padding:\s*40px\s*20px/.test(phone), "phone padding: 40px 20px");
});

test("the drag-overlay live region is ds-sr-only", (t) => {
  assert.ok(/class="drag-text ds-sr-only"/.test(pages["editor.html"]), "#drag-overlay text uses ds-sr-only");
});

test("the dark band nests h2 and paragraph in a 16px stack, button 32px below", (t) => {
  const html = pages["index.html"];
  assert.ok(/class="ds-band-text"[\s\S]*?<div class="ds-stack ds-stack--lg">/.test(html), "band wraps content in ds-stack--lg");
  assert.ok(/<div class="ds-stack ds-stack--md">[\s\S]*?<h2>Verify it yourself in a minute\./.test(html), "band h2 and paragraph share ds-stack--md");
  assert.ok(/<\/div>\s*<a class="ds-btn ds-btn--primary" href="\/privacy\.html#verify">/.test(html), "band button follows the stack");
});

test("no em dash in body copy outside code blocks, title or meta", (t) => {
  const problems = [];
  for (const [page, html] of Object.entries(pages)) {
    if (/—/.test(bodyCopy(html))) problems.push(page);
  }
  assert.deepStrictEqual(problems, [], `em dash in body copy of: ${problems.join(", ")}`);
});

test(".ds-stack stretches children to fill width; buttons and badges stay content-sized", (t) => {
  const stack = sharedStackBlock(theme, ".ds-stack--sm,");
  assert.ok(/align-items:\s*stretch/.test(stack), "ds-stack align-items: stretch");
  assert.ok(!/align-items:\s*flex-start/.test(stack), "ds-stack no longer uses align-items: flex-start");
  const stacked = cssBlock(theme, ".ds-stack > .ds-btn");
  assert.ok(/align-self:\s*flex-start/.test(stacked), "stacked buttons use align-self: flex-start");
  assert.ok(
    theme.includes(".ds-stack > .ds-badge-dark") && theme.includes(".ds-stack > .ds-badge-light") && theme.includes(".ds-stack > .ds-badge-soon"),
    "badges are in the no-stretch rule",
  );
  const start = cssBlock(theme, ".ds-stack--start {");
  assert.ok(/align-items:\s*flex-start/.test(start), "ds-stack--start sets align-items: flex-start");
});

test("every landing section on index.html wraps its content in ds-container", (t) => {
  const html = pages["index.html"];
  let count = 0;
  for (const m of html.matchAll(/<section\b[^>]*>/g)) {
    const body = html.slice(m.index);
    const end = body.indexOf("</section>");
    assert.ok(end !== -1, `section at ${m.index} is closed`);
    const inner = body.slice(0, end);
    assert.ok(
      /<div class="[^"]*\bds-container\b[^"]*">/.test(inner),
      `section at ${m.index} wraps its content in ds-container`,
    );
    count++;
  }
  assert.ok(count >= 6, `found ${count} landing sections`);
});

test("footers share the container left edge on index.html and privacy.html", (t) => {
  for (const page of ["index.html", "privacy.html"]) {
    assert.ok(
      /<footer class="[^"]*\bds-footer\b[^"]*\bds-container\b[^"]*">/.test(pages[page]),
      `${page} footer has class ds-footer ds-container`,
    );
  }
});

test("#download-pdf fills the export section width", (t) => {
  const block = cssBlock(editorCss, "#download-pdf {");
  assert.ok(/width:\s*100%/.test(block), "#download-pdf width: 100%");
});

test("Export segmented control spans full width with equal segments", (t) => {
  const wrap = cssBlock(editorCss, ".right-panel .ds-segmented {");
  assert.ok(/width:\s*100%/.test(wrap), "export segmented width: 100%");
  const seg = cssBlock(editorCss, ".right-panel .ds-segment {");
  assert.ok(/flex:\s*1/.test(seg), "segments share width equally");
});

test("shortcut rows keep label left, keys right-aligned, 12px apart", (t) => {
  const row = cssBlock(editorCss, ".shortcut-row {");
  assert.ok(/justify-content:\s*space-between/.test(row), "label left, keys right");
  assert.ok(/margin-block-end:\s*12px/.test(row), "12px vertical rhythm between rows");
  const keys = cssBlock(editorCss, ".shortcut-keys {");
  assert.ok(/display:\s*inline-flex/.test(keys), "key caps are a fixed inline-flex group");
  assert.ok(/<span class="shortcut-keys">/.test(pages["editor.html"]), "shortcut markup wraps keys");
});

test("editor wordmark reads PrivyPDF with no gap between parts", (t) => {
  assert.ok(
    /<div class="wordmark"><span>Privy<\/span><strong>PDF<\/strong><\/div>/.test(pages["editor.html"]),
    '"Privy" and "PDF" are adjacent, no whitespace between',
  );
  const wm = cssBlock(editorCss, ".wordmark {");
  assert.ok(!/gap/.test(wm), "wordmark has no gap creating a visible space");
});

test("hero floatbar is one centered nowrap line without the dot separator", (t) => {
  assert.ok(!/ds-hero-floatbar-sep/.test(pages["index.html"]), "dot separator removed");
  const bar = cssBlock(theme, ".ds-hero-floatbar {");
  assert.ok(/white-space:\s*nowrap/.test(bar), "floatbar does not wrap");
  assert.ok(/width:\s*max-content/.test(bar), "floatbar is content-sized");
  assert.ok(!/flex-wrap\s*:\s*wrap/.test(bar), "flex-wrap wrap removed");
});

test("hero window fits content with two sheet rows", (t) => {
  const win = cssBlock(theme, ".ds-hero-media .ds-window {");
  assert.ok(!/height:\s*300px/.test(win), "window height no longer fixed at 300px");
  const sheets = cssBlock(theme, ".ds-hero-sheets {");
  assert.ok(/grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(sheets), "desktop shows two rows of three mini sheets");
});

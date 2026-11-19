import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const theme = readFileSync(join(ROOT, "css/theme.css"), "utf8");
const editor = readFileSync(join(ROOT, "editor.html"), "utf8");

function classTokens(htmlText) {
  return [...htmlText.matchAll(/class\s*=\s*"([^"]*)"/gi)].flatMap((m) =>
    m[1].split(/\s+/).filter((token) => token.length > 0),
  );
}

// Classes the D3 editor used before the redesign; none of them may survive as
// class tokens in editor.html now that component styling comes from theme.css.
const legacy = new Set([
  "shape",
  "line",
  "heading",
  "image",
  "chart",
  "bar",
  "check",
  "sheet",
  "page-card",
  "float-btn",
  "float-label",
  "size-btn",
  "rail-item",
  "icon-btn",
  "btn-add",
  "btn-outline",
  "btn-primary",
]);

test("editor.html loads css/theme.css and never css/main.css", (t) => {
  assert.ok(
    editor.includes('href="/css/theme.css"'),
    "editor.html does not load css/theme.css",
  );
  assert.ok(!/css\/main\.css/.test(editor), "editor.html still loads css/main.css");
});

test("editor.html uses no legacy editor classes", (t) => {
  const hits = classTokens(editor).filter((token) => legacy.has(token));
  assert.deepStrictEqual(hits, [], `editor.html still uses legacy classes: ${hits.join(", ")}`);
});

test("every ds- class used in editor.html is defined in css/theme.css", (t) => {
  const missing = [];
  for (const token of classTokens(editor)) {
    if (!token.startsWith("ds-")) continue;
    if (!theme.includes(`.${token}`)) missing.push(token);
  }
  assert.deepStrictEqual(missing, [], `editor.html uses undefined theme classes: ${missing.join(", ")}`);
});

const editorCss = readFileSync(join(ROOT, "css/editor.css"), "utf8");

function element(id) {
  const m = editor.match(new RegExp(`<[\\w:-]+[^>]*\\bid="${id}"[^>]*>`));
  return m ? m[0] : "";
}
function hasClass(id, token) {
  const cm = element(id).match(/\bclass\s*=\s*"([^"]*)"/);
  return !!cm && cm[1].split(/\s+/).includes(token);
}

test("editor.html shell keeps every original id", (t) => {
  const ids = [...editor.matchAll(/id\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
  const required = [
    "top-bar","add-files","btn-undo","btn-redo","btn-download","top-details",
    "file-name",
    "rail","rail-merge","rail-images","rail-extract",
    "workarea","sub-toolbar","sub-status","select-all","size-wrap","size-large","size-small",
    "grid-wrap","empty-state","empty-drop","page-grid","add-tile","loading-state","skeleton-grid","info-card","drag-overlay",
    "float-bar","float-label","float-rotate","float-duplicate","float-extract","float-delete",
    "right-panel","doc-name","stat-pages","stat-source","stat-size","source-files","export-all","export-selected","download-pdf","privacy-count",
    "drawer-scrim",
  ];
  const missing = required.filter((id) => !ids.includes(id));
  assert.deepStrictEqual(missing, [], `editor.html missing ids: ${missing.join(", ")}`);
});

test("editor shell landmarks use ds- classes", (t) => {
  assert.ok(hasClass("top-bar", "ds-app-topbar"), "#top-bar uses ds-app-topbar");
  assert.ok(hasClass("rail", "ds-rail"), "#rail uses ds-rail");
  assert.ok(hasClass("right-panel", "ds-panel"), "#right-panel uses ds-panel");
  assert.ok(hasClass("float-bar", "ds-floatbar"), "#float-bar uses ds-floatbar");
  assert.ok(hasClass("size-wrap", "ds-segmented"), "#size-wrap uses ds-segmented");
  assert.ok(hasClass("empty-drop", "ds-dropzone"), "#empty-drop uses ds-dropzone");
  assert.ok(hasClass("doc-name", "ds-input"), "#doc-name uses ds-input");
  assert.ok(hasClass("info-card", "ds-card"), "#info-card uses ds-card");
  // The privacy card is a ds-card (never green), nested inside a panel
  // section so it sits inside the section padding like other content.
  assert.ok(
    /<div class="[^"]*\bpanel-section\b[^"]*">[\s\S]*?<div class="ds-card">/.test(editor),
    "privacy card (ds-card) is nested inside a panel section",
  );
});

test("shell geometry: the page itself never scrolls", (t) => {
  assert.ok(/html\s*\{\s*[\s\S]*?overflow:\s*hidden/.test(editorCss), "html overflow: hidden");
  assert.ok(/\.app\s*\{\s*[\s\S]*?height:\s*100dvh/.test(editorCss), ".app height: 100dvh");
  assert.ok(/\.app-body\s*\{\s*[\s\S]*?flex:\s*1/.test(editorCss), ".app-body flex: 1");
  assert.ok(/\.workarea\s*\{\s*[\s\S]*?min-width:\s*0/.test(editorCss), "#workarea min-width: 0");
  assert.ok(/\.grid-wrap\s*\{\s*[\s\S]*?overflow-y:\s*auto/.test(editorCss), "#grid-wrap overflow-y: auto");
});

test("page grid: auto-fill 196px columns, fluid below 700px", (t) => {
  assert.ok(/#page-grid\s*\{\s*[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,\s*196px/.test(editorCss), "grid uses repeat(auto-fill, 196px)");
  assert.ok(/@media\s*\(max-width:\s*699px\)/.test(editorCss), "editor.css has a 700px breakpoint");
  assert.ok(/minmax\(140px,\s*1fr\)/.test(editorCss), "grid switches to minmax(140px, 1fr) below 700px");
  assert.ok(/aspect-ratio\s*:\s*196\s*\/\s*254/.test(editorCss), "sheets keep aspect-ratio 196/254 below 700px");
});

// Returns the body of the first `@media (max-width: Npx)` block, handling
// the nested rules inside it.
function mediaBlock(css, maxWidth) {
  const atRule = `@media (max-width: ${maxWidth}px)`;
  const start = css.indexOf(atRule);
  assert.ok(start !== -1, `editor.css is missing ${atRule}`);
  let i = css.indexOf("{", start);
  let depth = 0;
  const bodyStart = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(bodyStart + 1, i);
    }
  }
  return "";
}

test("theme.css hides elements with the hidden attribute", (t) => {
  assert.ok(
    /\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/.test(theme),
    "css/theme.css has [hidden] { display: none !important; } in the base layer",
  );
});

test("editor.css phone layout below 700px: workarea, grid-wrap, rail", (t) => {
  const phone = mediaBlock(editorCss, 699);
  assert.ok(
    /#workarea\s*\{[\s\S]*?min-height:\s*0/.test(phone),
    "phone block sets #workarea min-height: 0",
  );
  assert.ok(
    /grid-wrap\s*\{[\s\S]*?overflow-y:\s*auto/.test(phone),
    "phone block sets grid-wrap overflow-y: auto",
  );
  assert.ok(
    /#rail\s*\{[\s\S]*?justify-content:\s*flex-start/.test(phone),
    "phone block sets #rail justify-content: flex-start",
  );
});

test("theme.css: plain .ds-sheet-grid has no max-width", (t) => {
  const start = theme.indexOf(".ds-sheet-grid");
  assert.ok(start !== -1, "css/theme.css defines .ds-sheet-grid");
  const open = theme.indexOf("{", start);
  const close = theme.indexOf("}", open);
  const body = theme.slice(open + 1, close);
  assert.ok(!/max-width/.test(body), ".ds-sheet-grid must not cap its width");
  assert.ok(
    /\.ds-guide\s+\.ds-sheet-grid\s*\{[\s\S]*?max-width:\s*720px/.test(theme),
    "the 720px cap lives only under .ds-guide .ds-sheet-grid",
  );
});

test("editor.css phone block (479px): .sub-right is a row flex container", (t) => {
  const phone = mediaBlock(editorCss, 479);
  const match = phone.match(/\.sub-right\s*\{([\s\S]*?)\}/);
  assert.ok(match, "phone block defines .sub-right");
  const body = match[1];
  assert.ok(/display:\s*flex/.test(body), ".sub-right is display: flex");
  assert.ok(/flex-direction:\s*row/.test(body), ".sub-right direction is row");
  assert.ok(/flex-wrap:\s*nowrap/.test(body), ".sub-right does not wrap");
  assert.ok(/gap:\s*8px/.test(body), ".sub-right gap is 8px");
});

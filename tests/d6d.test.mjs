import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

// --- CSS rule extraction (helper shape matches tests/d6b.test.mjs) ---------

// Finds a rule whose selector begins at the start of a line, so a selector
// that also appears nested inside an @media block (e.g. `.ds-promise-grid {`
// in a grouped selector) doesn't shadow the standalone rule.
function cssBlockAtLineStart(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escaped, "m");
  const m = re.exec(css);
  assert.ok(m, `css defines ${selector} at the start of a line`);
  const open = m.index + m[0].indexOf("{");
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

// --- HTML / JS scanning (helper shape matches tests/pages-hygiene.test.mjs) -

function parseAttrs(attrStr) {
  const attrs = {};
  const re = /\b([a-zA-Z][\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(attrStr))) {
    const value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
    attrs[m[1].toLowerCase()] = value;
  }
  return attrs;
}

function moduleScriptsOf(htmlText) {
  const out = [];
  const tagRe = /<script\b([^>]*)>/gi;
  let match;
  while ((match = tagRe.exec(htmlText))) {
    const attrs = parseAttrs(match[1]);
    if (attrs.type === "module" && attrs.src) out.push(attrs.src);
  }
  return out;
}

function importsOf(jsText) {
  const out = [];
  for (const m of jsText.matchAll(/import\s+[^;]*?from\s*["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  return out;
}

function resolveModule(specifier) {
  if (specifier.startsWith("/")) return join(ROOT, specifier.slice(1));
  return join(ROOT, "js", specifier);
}

// References initSite( as a call, not as a function declaration (site.js
// declares initSite but never calls it).
function isInitSiteCall(jsText) {
  return jsText.includes("initSite(") && !/function\s+initSite\s*\(/.test(jsText);
}

// ---------------- Item 1: every data-navbar page boots the navbar ----------

test("every page with a data-navbar loads a module that calls initSite()", (t) => {
  const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
  const problems = [];
  for (const page of htmlFiles) {
    const html = read(page);
    if (!/data-navbar/.test(html)) continue;
    const seen = new Set();
    const stack = [...moduleScriptsOf(html)];
    let found = false;
    while (stack.length) {
      const src = stack.pop();
      if (seen.has(src)) continue;
      seen.add(src);
      let text = "";
      try {
        text = readFileSync(resolveModule(src), "utf8");
      } catch {
        problems.push(`${page}: module script ${src} is missing on disk`);
        continue;
      }
      if (isInitSiteCall(text)) found = true;
      for (const spec of importsOf(text)) stack.push(spec);
    }
    if (!found) {
      problems.push(
        `${page} has data-navbar but loads no module that calls initSite()`,
      );
    }
  }
  assert.deepStrictEqual(
    problems,
    [],
    "every page with data-navbar must load a module that calls initSite(): " +
      problems.join("; "),
  );
});

// ---------------- Item 2: privacy proof spacing ----------------------------

test("privacy proof field is 32px below the cards and 48px above the FAQ", (t) => {
  const theme = read("css/theme.css");
  const grid = cssBlockAtLineStart(theme, ".ds-promise-grid {");
  assert.ok(
    /margin-block-end:\s*32px/.test(grid),
    ".ds-promise-grid leaves 32px below the card row (margin-block-end: 32px)",
  );
  assert.ok(
    /margin-top:\s*48px/.test(cssBlockAtLineStart(theme, "#faq {")),
    "#faq sits 48px below the proof field (margin-top: 48px)",
  );
});

// ---------------- Item 3: facts strip inside ds-container ------------------

test("facts strip lives inside ds-container on index.html", (t) => {
  const html = read("index.html");
  assert.ok(
    /<div class="ds-container ds-facts">/.test(html),
    "facts strip is inside ds-container (content starts at the container edge)",
  );
  const theme = read("css/theme.css");
  const facts = cssBlockAtLineStart(theme, ".ds-facts {");
  assert.ok(/gap:\s*56px/.test(facts), ".ds-facts keeps a 56px gap at desktop");
  assert.ok(
    /justify-content:\s*center/.test(facts),
    ".ds-facts is one centered row",
  );
  const below900 = theme.slice(theme.indexOf("@media (max-width: 899px)"));
  assert.ok(
    below900.includes("ds-fact") && below900.includes("calc(50% - 28px)"),
    "facts strip is 2x2 below 900px",
  );
});

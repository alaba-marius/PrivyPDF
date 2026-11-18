import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// index.html and privacy.html are the D2 pages; editor.html and
// design-system.html are the pages we still ship unchanged.
const PAGES = ["index.html", "privacy.html", "design-system.html", "editor.html"];

// editor.html is owned by D3 and deliberately not rewritten in this phase.
// Its demo mode is activated by the hash alone (/editor.html#demo), so anchors
// that point at it never need a matching id on that page.
function isEditorTarget(targetPage) {
  return targetPage === "/editor.html";
}

function read(page) {
  return readFileSync(join(ROOT, page), "utf8");
}

const html = {};
for (const page of PAGES) html[page] = read(page);

const iconsSource = readFileSync(join(ROOT, "js/icons.js"), "utf8");
const iconNames = new Set(
  [...iconsSource.matchAll(/^\s*"?([\w-]+)"?\s*:/gm)].map((m) => m[1]),
);

function* scanTags(htmlText) {
  const tagRe = /<([A-Za-z][\w-]*)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(htmlText))) {
    yield { tag: match[1].toLowerCase(), attrs: match[2] };
  }
}

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

function idsOf(htmlText) {
  const ids = new Set();
  for (const m of htmlText.matchAll(/\bid\s*=\s*"([^"]*)"/gi)) {
    ids.add(m[1]);
  }
  return ids;
}

const pageIds = {};
for (const page of PAGES) pageIds[page] = idsOf(html[page]);

function anchorTargets(htmlText) {
  const out = [];
  for (const { attrs } of scanTags(htmlText)) {
    if (attrs.href === undefined) continue;
    const parsed = parseAttrs(attrs);
    const href = parsed.href;
    const hash = href.indexOf("#");
    const targetPage = hash === -1 ? href : href.slice(0, hash);
    const anchorId = hash === -1 ? "" : href.slice(hash + 1);
    out.push({ href, targetPage, anchorId });
  }
  return out;
}

function assetUrls(htmlText) {
  const out = [];
  for (const { attrs } of scanTags(htmlText)) {
    const parsed = parseAttrs(attrs);
    for (const name of ["href", "src"]) {
      if (parsed[name] !== undefined) out.push(parsed[name]);
    }
  }
  return out;
}

function isExternal(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

test("index and privacy load css/theme.css and never css/main.css", (t) => {
  for (const page of ["index.html", "privacy.html"]) {
    assert.ok(
      html[page].includes('href="/css/theme.css"'),
      `${page} does not load css/theme.css`,
    );
    assert.ok(
      !/css\/main\.css/.test(html[page]),
      `${page} still loads css/main.css`,
    );
  }
});

test("no inline style attributes on any page", (t) => {
  for (const page of PAGES) {
    assert.ok(!/\sstyle\s*=/i.test(html[page]), `${page} contains a style attribute`);
  }
});

test("no inline <style> blocks on any page", (t) => {
  for (const page of PAGES) {
    assert.ok(!/<style\b/i.test(html[page]), `${page} contains a <style> block`);
  }
});

test("all scripts are external same-origin scripts", (t) => {
  for (const page of PAGES) {
    for (const { tag, attrs } of scanTags(html[page])) {
      if (tag !== "script") continue;
      const parsed = parseAttrs(attrs);
      assert.ok(parsed.src != null, `${page} has an inline script`);
      assert.ok(
        !isExternal(parsed.src),
        `${page} loads an external script ${parsed.src}`,
      );
    }
  }
});

test("no external http(s) asset URLs on any page", (t) => {
  for (const page of PAGES) {
    for (const value of assetUrls(html[page])) {
      if (value.startsWith("#") || value.startsWith("data:")) continue;
      assert.ok(
        !isExternal(value),
        `${page} loads external asset ${value}`,
      );
    }
  }
});

test("every same-origin link target exists on disk", (t) => {
  for (const page of PAGES) {
    for (const value of assetUrls(html[page])) {
      if (value.startsWith("#") || value.startsWith("data:")) continue;
      if (isExternal(value)) continue;
      const target = join(ROOT, value.replace(/#.*$/, ""));
      assert.ok(existsSync(target), `${page} links to missing asset ${value}`);
    }
  }
});

test("ids are unique within each page", (t) => {
  for (const page of PAGES) {
    for (const id of pageIds[page]) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp('\\bid\\s*=\\s*"' + escaped + '"', "gi");
      assert.equal(
        html[page].match(re).length,
        1,
        `${page} has a duplicate or missing id "${id}"`,
      );
    }
  }
});

test("anchors with a hash resolve to an id on their target page", (t) => {
  for (const page of PAGES) {
    for (const { targetPage, anchorId } of anchorTargets(html[page])) {
      if (anchorId === "") continue;
      if (!targetPage) {
        // Same-page anchor.
        assert.ok(
          pageIds[page].has(anchorId),
          `${page}: #${anchorId} has no matching id`,
        );
        continue;
      }
      if (isEditorTarget(targetPage)) continue; // D3-owned; hash activates demo mode
      const targetFile =
        targetPage === "/" ? "index.html" : targetPage.replace(/^\//, "");
      assert.ok(
        pageIds[targetFile]?.has(anchorId),
        `${page}: ${targetPage}#${anchorId} has no matching id`,
      );
    }
  }
});

test("every page has a lang attribute", (t) => {
  for (const page of PAGES) {
    assert.ok(/<html\b[^>]*\blang\s*=/i.test(html[page]), `${page} has no lang attribute`);
  }
});

// index.html and privacy.html are the authored D2 pages: each gets one h1.
// design-system.html is a style guide whose composites carry their own h1,
// and editor.html is owned by D3 and deliberately untouched.
test("index and privacy each have exactly one h1", (t) => {
  for (const page of ["index.html", "privacy.html"]) {
    const count = (html[page].match(/<h1\b/gi) || []).length;
    assert.equal(count, 1, `${page} has ${count} h1 elements`);
  }
});

test("every img has an alt attribute", (t) => {
  for (const page of PAGES) {
    for (const { tag, attrs } of scanTags(html[page])) {
      if (tag !== "img") continue;
      const parsed = parseAttrs(attrs);
      assert.ok("alt" in parsed, `${page} has an img without alt`);
    }
  }
});

test("every data-icon name exists in js/icons.js", (t) => {
  for (const page of PAGES) {
    for (const m of html[page].matchAll(/data-icon\s*=\s*"([^"]*)"/gi)) {
      assert.ok(
        iconNames.has(m[1]),
        `${page} uses unknown icon "${m[1]}"`,
      );
    }
  }
});

function walkJs(dir) {
  let out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// element.style assignments go through the CSSOM and are CSP-safe; inline style
// attributes in markup strings are not. Every js file we ship must be free of
// both.
test("no inline-style sources in any js file under js/", (t) => {
  const hits = [];
  for (const file of walkJs(join(ROOT, "js"))) {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(ROOT.length + 1);
    if (/\bstyle\s*=['"]/s.test(src)) hits.push(`${rel}: inline style attribute`);
    if (/setAttribute\s*\(\s*['"]style['"]\s*,/s.test(src))
      hits.push(`${rel}: setAttribute("style")`);
  }
  assert.equal(
    hits.length,
    0,
    `inline-style sources found in JS: ${hits.join(", ")}`
  );
});

test("editor.html meta CSP matches vercel.json policy (frame-ancestors aside)", (t) => {
  const meta = html["editor.html"].match(
    /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=(["'])([\s\S]*?)\1/i
  );
  assert.ok(
    meta,
    "editor.html has no Content-Security-Policy meta element"
  );
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  let policy = "";
  for (const header of vercel.headers[0].headers) {
    if (header.key === "Content-Security-Policy") {
      policy = header.value;
      break;
    }
  }
  assert.ok(policy, "vercel.json has no Content-Security-Policy header");
  const normalize = (p) =>
    String(p)
      .split(";")
      .map((s) => s.trim())
      .filter((d) => d.length > 0 && !d.startsWith("frame-ancestors"))
      .join("; ");
  assert.equal(
    normalize(meta[2]),
    normalize(policy),
    'editor.html meta CSP does not equal the vercel.json policy (ignoring frame-ancestors)'
  );
});

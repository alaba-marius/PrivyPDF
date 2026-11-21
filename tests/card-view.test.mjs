import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sheetHtml, applySheetStyles, checkMarkup, fitSize, rotationScale } from "../js/core/card-view.js";
import { effectiveRotation } from "../js/core/pages.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const page = {
  id: "p1",
  sourceId: "s1",
  index: 0,
  baseRotation: 0,
  rotated: 0,
  width: 612,
  height: 792,
};

test("sheetHtml renders a real page card shell", (t) => {
  const html = sheetHtml(page);
  assert.ok(html.includes('class="ds-sheet" data-rotate="0"'));
  assert.ok(html.includes('<div class="ds-sheet-page">'));
  assert.ok(html.includes('<canvas class="page-canvas"'));
  assert.ok(html.includes('class="thumb-skeleton ds-skeleton"'));
});

test("sheet rotation is the file rotation plus the user rotation", (t) => {
  const html = sheetHtml({ ...page, baseRotation: 90, rotated: 90 });
  assert.ok(html.includes('data-rotate="180"'));
  assert.equal(effectiveRotation({ ...page, baseRotation: 90, rotated: 0 }), 90);
  assert.equal(effectiveRotation({ ...page, baseRotation: 0, rotated: 270 }), 270);
});

test("applySheetStyles writes --rotate through the CSSOM", (t) => {
  const style = {};
  const sheet = {
    dataset: { rotate: "180" },
    style: {
      setProperty(key, value) {
        style[key] = value;
      },
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
  applySheetStyles(sheet, { rotate: 180 });
  assert.equal(style["--rotate"], "180deg");
});

test("checkMarkup emits the ds-check selection badge", (t) => {
  const html = checkMarkup();
  assert.ok(html.includes('class="ds-check"'));
  assert.ok(html.includes("M20 6 9 17l-5-5")); // icon("check") path
});

test("fitSize contains a page inside the box without stretching or upscaling", () => {
  // Portrait page, box limits width.
  assert.deepStrictEqual(fitSize(612, 792, 164, 218), { width: 164, height: 212 });
  // Landscape page, box limits width.
  assert.deepStrictEqual(fitSize(842, 595, 164, 218), { width: 164, height: 116 });
  // Square page.
  assert.deepStrictEqual(fitSize(612, 612, 164, 218), { width: 164, height: 164 });
  // Never upscale beyond the page's natural size.
  assert.deepStrictEqual(fitSize(100, 100, 500, 500), { width: 100, height: 100 });
  // Tiny page in a huge box keeps its size.
  assert.deepStrictEqual(fitSize(40, 60, 1000, 1000), { width: 40, height: 60 });
  // A page with an intrinsic /Rotate of 90 or 270 swaps its width and height
  // before fitting (the caller swaps; fitSize itself just fits w x h).
  assert.deepStrictEqual(fitSize(792, 612, 164, 218), { width: 164, height: 127 });
  assert.deepStrictEqual(fitSize(612, 792, 218, 164), { width: 127, height: 164 });
});

test("rotationScale returns 1 at user rotation 0 and 180 (the fitted page already fits)", () => {
  // 410x560 pt page in a 164x218 px box, baseRotation 0: fitSize gives 160x218,
  // which already fits the box, so the scale is exactly 1.
  assert.equal(rotationScale(0, 410, 560, 0, 164, 218), 1);
  assert.equal(rotationScale(180, 410, 560, 0, 164, 218), 1);
});

test("rotationScale at user rotation 90/270 is at most 1 and keeps the rotated page inside the box", () => {
  // Portrait page: fitSize gives 160x218; rotated 90 it becomes 218x160 and is
  // scaled down so both axes fit the 164x218 box.
  const s = rotationScale(90, 410, 560, 0, 164, 218);
  assert.ok(s <= 1);
  assert.ok(218 * s <= 164 && 160 * s <= 218);
  assert.equal(s, rotationScale(270, 410, 560, 0, 164, 218));
  // Negative rotation normalizes (-90 == 270).
  assert.equal(rotationScale(-90, 410, 560, 0, 164, 218), rotationScale(270, 410, 560, 0, 164, 218));
  // Landscape page.
  assert.ok(rotationScale(90, 842, 595, 0, 164, 218) <= 1);
  // Square page.
  assert.ok(rotationScale(90, 612, 612, 0, 164, 218) <= 1);
  // baseRotation 90 combined with user rotation also stays inside the box.
  assert.ok(rotationScale(90, 410, 560, 90, 164, 218) <= 1);
  assert.ok(rotationScale(270, 410, 560, 270, 164, 218) <= 1);
});

test("rotationScale never upscales and is stable on re-sync", () => {
  // A tiny page in a huge box never scales beyond 1.
  assert.equal(rotationScale(0, 50, 50, 0, 500, 500), 1);
  assert.equal(rotationScale(90, 50, 50, 0, 500, 500), 1);
  // Same inputs always yield the same scale: re-syncing cannot shrink the page.
  const a = rotationScale(90, 410, 560, 0, 164, 218);
  assert.equal(a, rotationScale(90, 410, 560, 0, 164, 218));
  assert.ok(a <= 1);
});

test("rotationScale derives the fit scale from the effective rotation (base + user)", () => {
  // 595x842 page with the file's own /Rotate 90 and no user rotation:
  // effective rotation 90, scale below 1, rotated page fits the box.
  const s1 = rotationScale(0, 595, 842, 90, 164, 218);
  const { width: dw1, height: dh1 } = fitSize(595, 842, 164, 218);
  assert.ok(s1 < 1, `effective 90 scales down: ${s1}`);
  assert.ok(dh1 * s1 <= 164 + 1e-6 && dw1 * s1 <= 218 + 1e-6, "rotated page fits the box");

  // File rotation 90 plus user 90 is effective 180: the fitted page fits as-is.
  assert.equal(rotationScale(90, 595, 842, 90, 164, 218), 1);

  // File rotation 270 plus user 90 wraps to effective 0.
  assert.equal(rotationScale(90, 595, 842, 270, 164, 218), 1);

  // Base 0 with user 90 behaves as before: effective 90, scale below 1.
  const s2 = rotationScale(90, 595, 842, 0, 164, 218);
  assert.ok(s2 < 1 && s2 === rotationScale(90, 595, 842, 0, 164, 218));

  // Landscape page at effective 90 scales to fit.
  const s3 = rotationScale(90, 842, 595, 0, 164, 218);
  assert.ok(s3 <= 1);
  const { width: dw3, height: dh3 } = fitSize(842, 595, 164, 218);
  assert.ok(dh3 * s3 <= 164 + 1e-6 && dw3 * s3 <= 218 + 1e-6);

  // Idempotent on re-sync: same inputs always give the same scale.
  assert.equal(s3, rotationScale(90, 842, 595, 0, 164, 218));
});

test("cards.js never measures .ds-sheet-page with getBoundingClientRect", () => {
  const source = readFileSync(join(ROOT, "js", "ui", "cards.js"), "utf8");
  assert.ok(
    !/querySelector\(["']\.ds-sheet-page["']\)[\s\S]{0,200}?getBoundingClientRect/.test(source),
    ".ds-sheet-page must be measured with offsetWidth/offsetHeight, not getBoundingClientRect (transformed rects shrink on re-sync)",
  );
});

test("applySheetStyles writes --scale through the CSSOM", (t) => {
  const style = {};
  const sheet = {
    dataset: { rotate: "180" },
    style: {
      setProperty(key, value) {
        style[key] = value;
      },
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
  applySheetStyles(sheet, { rotate: 180, scale: 0.5 });
  assert.equal(style["--rotate"], "180deg");
  assert.equal(style["--scale"], "0.5");
});

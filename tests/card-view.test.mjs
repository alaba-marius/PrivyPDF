import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sheetHtml,
  applySheetStyles,
  lineShape,
  headingShape,
  imageShape,
  chartShape,
} from "../js/core/card-view.js";

test("demo sheets emit design-system classes, not legacy shape classes", (t) => {
  assert.ok(lineShape(60).includes('class="ds-shape-line" data-w="60"'));
  assert.ok(headingShape(52).includes('class="ds-shape-heading" data-w="52"'));
  assert.ok(imageShape().includes('class="ds-shape-block" data-w="100"'));
  assert.ok(chartShape().includes('class="ds-shape-chart"'));
  assert.ok(chartShape().includes('data-h="40"'));
  assert.ok(!lineShape(1).includes('class="shape'));
  assert.ok(!chartShape().includes('class="shape chart"'));
});

test("sheet markup carries rotation and uses ds-sheet", (t) => {
  const html = sheetHtml({ id: "p3", rotated: 90 }, 2);
  assert.ok(html.includes('class="ds-sheet" data-rotate="90"'));
  assert.ok(!html.includes('data-rotate="0"'));
  assert.ok(html.includes('<div class="ds-sheet-page">'));
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
  applySheetStyles(sheet);
  assert.equal(style["--rotate"], "180deg");
});

test("applySheetStyles scales the sheet page down at 90/270°", (t) => {
  const pageStyle = {};
  const sheetStyle = {};
  const page = {
    style: {
      setProperty(key, value) {
        pageStyle[key] = value;
      },
    },
  };
  const sheet = {
    dataset: { rotate: "90" },
    style: {
      setProperty(key, value) {
        sheetStyle[key] = value;
      },
    },
    querySelector(sel) {
      return sel === ".ds-sheet-page" ? page : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  applySheetStyles(sheet);
  assert.equal(sheetStyle["--rotate"], "90deg");
  assert.equal(pageStyle["--scale"], "0.77");

  sheet.dataset.rotate = "270";
  applySheetStyles(sheet);
  assert.equal(pageStyle["--scale"], "0.77");

  sheet.dataset.rotate = "0";
  applySheetStyles(sheet);
  assert.equal(pageStyle["--scale"], "1");
});

test("applySheetStyles applies data-w and data-h to child shapes", (t) => {
  const bar = {
    dataset: { w: "70", h: "50" },
    style: {},
  };
  const sheet = {
    dataset: {},
    style: {},
    querySelectorAll(sel) {
      return sel === "[data-w]" || sel === "[data-h]" ? [bar] : [];
    },
    querySelector() {
      return null;
    },
  };
  applySheetStyles(sheet);
  assert.equal(bar.style.width, "70%");
  assert.equal(bar.style.height, "50%");
});

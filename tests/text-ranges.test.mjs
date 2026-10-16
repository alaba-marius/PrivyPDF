import assert from "node:assert/strict";
import test from "node:test";
import { createEditorState, createHistory } from "../js/state.js";
import {
  applyFormattingRange,
  formattingTextSegments,
  horizontalScaleForAdvance,
  normalizeFormattingRanges,
  remapFormattingRanges,
  remapTextRange,
  standardPdfFontKey,
  validateTextRange,
} from "../js/text-ranges.js";

test("validates integer UTF-16 ranges within the selected text", () => {
  assert.equal(validateTextRange("A😀B", { start: 1, end: 3 }), true);
  assert.equal(validateTextRange("text", { start: 1.5, end: 2 }), false);
  assert.equal(validateTextRange("text", { start: -1, end: 2 }), false);
  assert.equal(validateTextRange("text", { start: 2, end: 2 }), false);
  assert.equal(validateTextRange("text", { start: 2, end: 5 }), false);
  assert.throws(
    () => normalizeFormattingRanges("text", [{ start: 0, end: 5, style: { bold: true } }]),
    RangeError
  );
});

test("resolves overlapping style ranges per property and coalesces equal neighbors", () => {
  const result = applyFormattingRange(
    "abcdef",
    [{ start: 0, end: 6, style: { bold: true } }],
    2,
    4,
    { color: "#ff0000" }
  );
  assert.deepEqual(result, [
    { start: 0, end: 2, style: { bold: true } },
    { start: 2, end: 4, style: { bold: true, color: "#ff0000" } },
    { start: 4, end: 6, style: { bold: true } },
  ]);
  assert.throws(
    () => applyFormattingRange("abc", [], 0, 2, { fontSize: 0 }),
    TypeError
  );
});

test("maps formatting ranges to styled and unstyled text segments without shifting offsets", () => {
  assert.deepEqual(
    formattingTextSegments("abcdef", [
      { start: 1, end: 3, style: { bold: true } },
      { start: 4, end: 6, style: { color: "#ff0000" } },
    ]),
    [
      { start: 0, end: 1, text: "a", style: null },
      { start: 1, end: 3, text: "bc", style: { bold: true } },
      { start: 3, end: 4, text: "d", style: null },
      { start: 4, end: 6, text: "ef", style: { color: "#ff0000" } },
    ]
  );
});

test("resolves standard font variants and safely rejects unsupported font families", () => {
  assert.equal(standardPdfFontKey("Helvetica", true, true), "HelveticaBoldOblique");
  assert.equal(standardPdfFontKey("Times", true, false), "TimesRomanBold");
  assert.equal(standardPdfFontKey("Courier", false, true), "CourierOblique");
  assert.equal(standardPdfFontKey("MissingFont", false, false), null);
});

test("fits styled segment advances without shifting following source text", () => {
  assert.equal(horizontalScaleForAdvance(42, 56, 100), 75);
  assert.equal(horizontalScaleForAdvance(42, 42, 85), 85);
  assert.equal(horizontalScaleForAdvance(42, 0, 100), null);
  assert.equal(horizontalScaleForAdvance(Number.NaN, 30, 100), null);
});

test("remaps unchanged ranges around inserted text and drops ranges intersecting edits", () => {
  const remapped = remapFormattingRanges("abcdef", "abXYcdef", [
    { start: 0, end: 2, style: { bold: true } },
    { start: 2, end: 4, style: { color: "#00ff00" } },
    { start: 4, end: 6, style: { italic: true } },
  ]);
  assert.deepEqual(remapped, [
    { start: 0, end: 2, style: { bold: true } },
    { start: 4, end: 6, style: { color: "#00ff00" } },
    { start: 6, end: 8, style: { italic: true } },
  ]);
  assert.deepEqual(
    remapFormattingRanges("abcdef", "abXYef", [
      { start: 2, end: 4, style: { color: "#00ff00" } },
    ]),
    []
  );
  assert.deepEqual(
    remapFormattingRanges("abcdef", "abXYef", [
      { start: 0, end: 6, style: { italic: true } },
    ]),
    [
      { start: 0, end: 2, style: { italic: true } },
      { start: 4, end: 6, style: { italic: true } },
    ]
  );
});

test("keeps active selection only when the full selection survives a text edit", () => {
  assert.deepEqual(
    remapTextRange("abcdef", "abXYcdef", { start: 4, end: 6 }),
    { start: 6, end: 8 }
  );
  assert.deepEqual(
    remapTextRange("abcdef", "XYabcdef", { start: 2, end: 5 }),
    { start: 4, end: 7 }
  );
  assert.equal(remapTextRange("abcdef", "abXYef", { start: 1, end: 4 }), null);
  assert.equal(remapTextRange("abcdef", "abXYef", { start: 0, end: 6 }), null);
});

test("range snapshots survive history undo and redo", () => {
  const state = createEditorState();
  state.pages = [{
    id: "page-1",
    annotations: [],
    formattingRanges: [{
      textTargetId: "pdf-text-1",
      text: "sample text",
      start: 0,
      end: 6,
      style: { bold: true },
    }],
  }];
  state.textRangeSelection = {
    pageId: "page-1",
    textTargetId: "pdf-text-1",
    text: "sample text",
    start: 0,
    end: 6,
  };
  const makeSnapshot = () => ({
    pages: structuredClone(state.pages),
    textRangeSelection: structuredClone(state.textRangeSelection),
  });
  const history = createHistory();
  history.push(makeSnapshot());
  state.pages[0].formattingRanges = [];
  state.textRangeSelection = null;
  const undone = history.undo(makeSnapshot());
  assert.equal(undone.pages[0].formattingRanges[0].style.bold, true);
  assert.deepEqual(undone.textRangeSelection, {
    pageId: "page-1",
    textTargetId: "pdf-text-1",
    text: "sample text",
    start: 0,
    end: 6,
  });
  state.pages = undone.pages;
  state.textRangeSelection = undone.textRangeSelection;
  const redone = history.redo(makeSnapshot());
  assert.deepEqual(redone.pages[0].formattingRanges, []);
  assert.equal(redone.textRangeSelection, null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { compressRanges, extractFileName } from "../js/core/extract-name.js";

test("compressRanges with a single page", () => {
  assert.equal(compressRanges([3]), "3");
});

test("compressRanges compresses a run", () => {
  assert.equal(compressRanges([3, 4, 5]), "3-5");
});

test("compressRanges mixes runs and singles", () => {
  assert.equal(compressRanges([3, 4, 5, 9]), "3-5,9");
  assert.equal(compressRanges([1, 2, 3, 7, 8, 10, 12]), "1-3,7-8,10,12");
});

test("compressRanges sorts and deduplicates", () => {
  assert.equal(compressRanges([5, 3, 3, 4]), "3-5");
  assert.equal(compressRanges([9, 1]), "1,9");
});

test("compressRanges with no positions is empty", () => {
  assert.equal(compressRanges([]), "");
});

test("extractFileName for a single page", () => {
  assert.equal(extractFileName("report.pdf", [3]), "report-pages-3.pdf");
});

test("extractFileName for a run and a mixed selection", () => {
  assert.equal(extractFileName("report.pdf", [3, 4, 5]), "report-pages-3-5.pdf");
  assert.equal(extractFileName("report.pdf", [3, 4, 5, 9]), "report-pages-3-5_9.pdf");
});

test("extractFileName truncates the stem at 40 characters and appends -etc", () => {
  assert.equal(
    extractFileName("this-is-a-very-long-document-name.pdf", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    "this-is-a-very-long-document-name-pages--etc.pdf",
  );
  assert.equal(
    extractFileName("this-is-a-very-long-document-name.pdf", [1]),
    "this-is-a-very-long-document-name-pages--etc.pdf",
  );
  // Exactly 40 characters stays as-is ("...docname12345" is 32 chars, plus
  // "-pages-1" makes a 40-character stem).
  assert.equal(
    extractFileName("exactfortycharactersdocname12345.pdf", [1]),
    "exactfortycharactersdocname12345-pages-1.pdf",
  );
});

test("extractFileName sanitizes the document name like the normal export name", () => {
  assert.equal(extractFileName("weird/name*.pdf", [1]), "weird_name_-pages-1.pdf");
  assert.equal(extractFileName("My Report.pdf", [2]), "My_Report-pages-2.pdf");
});

test("extractFileName always ends in .pdf", () => {
  assert.ok(extractFileName("report.pdf", [1, 2]).endsWith(".pdf"));
  assert.ok(extractFileName("report.pdf", []).endsWith(".pdf"));
});

// Exporter test against the REAL vendored pdf-lib (not a fake). Builds a
// multi-page input PDF with distinct page widths and a file rotation,
// exports with the real pdf-lib, then reloads the output with
// PDFDocument.load(bytes, { updateMetadata: false }) and asserts page count,
// order, sizes, rotation (base + user) and producer. Also embeds a tiny PNG
// and JPEG as image pages.
//
// This test fails on the pre-fix exporter: doc.copyPages(doc, [...]) throws
// ForeignPageError because a page copied from one document cannot be added to
// another — the fix is outDoc.copyPages(doc, [...]).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createExporter } from "../js/core/exporter.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { PDFDocument, StandardFonts, rgb, degrees } = await import(
  pathToFileURL(join(ROOT, "vendor", "pdf-lib", "pdf-lib.esm.min.js")).href
);

// Minimal valid images: an opaque white 1x1 PNG and a hand-crafted minimal
// baseline JPEG (SOI, APP0/JFIF, DQT, SOF0 1x1 grayscale, EOI — enough for
// pdf-lib to read the dimensions; it embeds the bytes as-is).
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAAAAAABVgNqpjQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const JPEG_1X1 = Uint8Array.from(
  Buffer.from(
    "ffd8" + // SOI
    "ffe000104a46494600010100000100010000" + // APP0: JFIF, 1x1, density 1x1
    "ffdb004300" + "01".repeat(64) + // DQT: luminance table, all 1s
    "ffc0000b0800010001010101" + // SOF0: 8-bit, 1x1, 1 component
    "ffd9", // EOI
    "hex",
  ),
);

function pdfSource(id, bytes) {
  return { id, kind: "pdf", bytes, type: "application/pdf", size: bytes.length, pageCount: 5 };
}
function imageSource(id, bytes, type, width, height) {
  return { id, kind: "image", bytes, type, size: bytes.length, pageCount: 1, width, height };
}

async function buildInput() {
  // 5 pages, distinct widths 410..450. Page index 1 carries the file's own
  // /Rotate = 90 (base rotation); the others have none.
  const input = await PDFDocument.create();
  const font = await input.embedFont(StandardFonts.Helvetica);
  const widths = [410, 420, 430, 440, 450];
  for (let i = 0; i < 5; i++) {
    const page = input.addPage([widths[i], 792]);
    page.drawText(`p${i + 1}`, { x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0) });
    if (i === 1) page.setRotation(degrees(90));
  }
  return { bytes: await input.save(), widths };
}

test("exporter with real pdf-lib: custom order, duplicates, base + user rotation, producer", async (t) => {
  const { bytes: inputBytes, widths } = await buildInput();
  const sources = new Map([["s1", pdfSource("s1", inputBytes)]]);

  // Custom order: index 3, index 1, index 4, index 0, index 0 again (a
  // duplicate), then a PNG image page and a JPEG image page.
  const pages = [
    { id: "a", sourceId: "s1", index: 3, rotated: 90 },    // width 440, base 0   -> 90
    { id: "b", sourceId: "s1", index: 1, rotated: 180 },    // width 420, base 90   -> 270
    { id: "c", sourceId: "s1", index: 4, rotated: 0 },      // width 450, base 0    -> 0
    { id: "d", sourceId: "s1", index: 0, rotated: 90 },     // width 410, base 0    -> 90
    { id: "e", sourceId: "s1", index: 0, rotated: 270 },    // duplicate of index 0 -> 270
  ];
  const sourcesWithImages = new Map(sources);
  sourcesWithImages.set("s2", imageSource("s2", PNG_1X1, "image/png", 20, 30));
  sourcesWithImages.set("s3", imageSource("s3", JPEG_1X1, "image/jpeg", 20, 30));
  pages.push(
    { id: "g", sourceId: "s2", index: 0, rotated: 0 },
    { id: "h", sourceId: "s3", index: 0, rotated: 0 },
  );

  const exporter = createExporter({ PDFLib: { PDFDocument, degrees } });
  const getSource = (id) => sourcesWithImages.get(id);

  const { name, bytes } = await exporter.exportPages({
    pages,
    getSource,
    fileName: "My Report",
    exportMode: "all",
    selected: new Set(),
  });
  assert.equal(name, "My_Report.pdf");

  const out = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(out.getProducer(), "PrivyPDF");
  assert.equal(out.getCreator(), "PrivyPDF");
  assert.equal(out.getPageCount(), 7);

  // Expected output order (widths, heights, rotation = base + user).
  const expectWidths = [440, 420, 450, 410, 410, 20, 20];
  const expectHeights = [792, 792, 792, 792, 792, 30, 30];
  const expectRotations = [90, 270, 0, 90, 270, 0, 0];
  for (let i = 0; i < 7; i++) {
    const page = out.getPage(i);
    assert.equal(page.getWidth(), expectWidths[i], `page ${i} width`);
    assert.equal(page.getHeight(), expectHeights[i], `page ${i} height`);
    assert.equal((page.getRotation().angle ?? 0), expectRotations[i], `page ${i} rotation`);
  }
});

test("exporter with real pdf-lib: selected-only export", async (t) => {
  const { bytes: inputBytes } = await buildInput();
  const sources = new Map([["s1", pdfSource("s1", inputBytes)]]);

  const pages = [
    { id: "a", sourceId: "s1", index: 0, rotated: 0 }, // width 410
    { id: "b", sourceId: "s1", index: 1, rotated: 90 }, // width 420, base 90 + user 90 -> 180
    { id: "c", sourceId: "s1", index: 3, rotated: 0 }, // width 440
  ];

  const exporter = createExporter({ PDFLib: { PDFDocument, degrees } });
  const getSource = (id) => sources.get(id);

  const { bytes } = await exporter.exportPages({
    pages,
    getSource,
    fileName: "selection",
    exportMode: "selected",
    selected: new Set(["b", "c"]),
  });

  const out = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(out.getPageCount(), 2);
  assert.equal(out.getPage(0).getWidth(), 420); // b: index 1
  assert.equal(out.getPage(0).getHeight(), 792);
  assert.equal((out.getPage(0).getRotation().angle ?? 0), 180); // base 90 + user 90
  assert.equal(out.getPage(1).getWidth(), 440); // c: index 3
  assert.equal((out.getPage(1).getRotation().angle ?? 0), 0);
});

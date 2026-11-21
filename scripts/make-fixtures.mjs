// Generates the sample PDFs and images used by the real-PDF tests under
// tests/fixtures/. Everything is built with the vendored pdf-lib bundle, the
// same engine the editor exports with, so the fixtures are real PDFs the
// editor itself could have produced.
//
// Usage: node scripts/make-fixtures.mjs   (from the repo root; no install)
// Re-runs are safe: existing files are overwritten.

import { mkdirSync, writeFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tests", "fixtures");
mkdirSync(OUT, { recursive: true });

// The previous fixture set is replaced: the editor no longer tests against
// one-page/three-page/rotated.pdf or the copied pdf-lib bundle.
for (const stale of ["1x1.png", "one-page.pdf", "three-page.pdf", "rotated.pdf", "pdf-lib.esm.mjs"]) {
  const p = join(OUT, stale);
  if (existsSync(p)) unlinkSync(p);
}

// ---------------- Tiny, dependency-free PNG encoder ----------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buf, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data]), 0, typeBuf.length + data.length), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, pixel) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = [0]; // filter byte: none
    for (let x = 0; x < width; x++) row.push(...pixel(x, y));
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateRawSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// shot.png — a small "screenshot" fixture.
writeFileSync(
  join(OUT, "shot.png"),
  encodePNG(20, 10, (x, y) => [(x * 13) % 256, (y * 21) % 256, 160]),
);

// photo.jpg — a hand-crafted minimal baseline JPEG (SOI, APP0/JFIF, DQT,
// SOF0 1x1 grayscale, EOI): enough for pdf-lib to read the dimensions.
writeFileSync(
  join(OUT, "photo.jpg"),
  Buffer.from(
    "ffd8" +
    "ffe000104a46494600010100000100010000" +
    "ffdb004300" + "01".repeat(64) +
    "ffc0000b0800010001010101" +
    "ffd9",
    "hex",
  ),
);

// ---------------- PDFs via the vendored pdf-lib ----------------

const { PDFDocument, StandardFonts, rgb, degrees } = await import(
  pathToFileURL(join(ROOT, "vendor", "pdf-lib", "pdf-lib.esm.min.js")).href
);

function textPage(doc, font, text) {
  const page = doc.addPage([612, 792]);
  page.drawText(text, { x: 50, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  return page;
}

async function save(doc, name) {
  writeFileSync(join(OUT, name), await doc.save());
  return name;
}

// twelve.pdf — 12 pages with distinct widths 410..520, so page order and size
// are both detectable in tests.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 12; i++) {
    const width = 400 + i * 10;
    const page = doc.addPage([width, 792]);
    page.drawText(`Page ${i} — ${width} pt wide`, { x: 50, y: 700, size: 18, font, color: rgb(0, 0, 0) });
  }
  await save(doc, "twelve.pdf");
}

// mixed.pdf — alternating portrait/landscape; page 3 carries the file's own
// /Rotate = 90 so pdf.js reports baseRotation 90 for it.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) {
    const landscape = i % 2 === 0;
    const page = doc.addPage(landscape ? [792, 612] : [612, 792]);
    page.drawText(`Page ${i}`, { x: 50, y: 700, size: 24, font, color: rgb(0, 0, 0) });
    if (i === 3) page.setRotation(degrees(90));
  }
  await save(doc, "mixed.pdf");
}

// three-sizes.pdf — three pages, three different sizes.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [w, h] of [[410, 792], [612, 792], [842, 595]]) {
    const page = doc.addPage([w, h]);
    page.drawText(`${w} x ${h}`, { x: 50, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  }
  await save(doc, "three-sizes.pdf");
}

// long-300.pdf — 300 pages, for lazy-thumbnail and virtual-scroll tests.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 300; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(String(i), { x: 50, y: 700, size: 10, font, color: rgb(0, 0, 0) });
  }
  await save(doc, "long-300.pdf");
}

// second.pdf — a second three-page source, for multi-file scenarios.
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) textPage(doc, font, `Second ${i}`);
  await save(doc, "second.pdf");
}

// corrupt.pdf — starts with the PDF magic bytes but is not a usable PDF, so a
// loader that validates magic then parses gets a real parse error.
writeFileSync(
  join(OUT, "corrupt.pdf"),
  Buffer.from("%PDF-1.4\n% this file is truncated garbage, not a real PDF\n"),
);

console.log("wrote fixtures:", readdirSync(OUT).sort().join(", "));

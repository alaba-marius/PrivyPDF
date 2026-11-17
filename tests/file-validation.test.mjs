import { test } from "node:test";
import assert from "node:assert";
import { validateFiles } from "../js/file-manager.js";

// Duck-typed file-like objects with synthetic bytes only — no real files.
function fileLike(name, type, bytes) {
  const buffer = new Uint8Array(bytes);
  return {
    name,
    type,
    size: buffer.length,
    slice: () => ({
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    }),
  };
}

test("valid PDF, PNG and JPEG pass magic-byte validation", async (t) => {
  const pdf = fileLike("report.pdf", "application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2D]);
  const png = fileLike("photo.png", "image/png", [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const jpg = fileLike("photo.jpg", "image/jpeg", [0xFF, 0xD8, 0xFF]);
  const result = await validateFiles([pdf, png, jpg]);
  assert.equal(result.valid.length, 3);
  assert.equal(result.rejected.length, 0);
});

test("right extension, wrong magic bytes -> not a PDF", async (t) => {
  const result = await validateFiles([fileLike("bad.pdf", "application/pdf", [0x00, 0x01, 0x02, 0x03])]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].reason, "not a PDF");
});

test("right extension, wrong magic bytes -> unsupported type for images", async (t) => {
  const result = await validateFiles([fileLike("bad.png", "image/png", [0x00, 0x01])]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected[0].reason, "unsupported type");
});

test("empty file -> empty file", async (t) => {
  const result = await validateFiles([fileLike("empty.pdf", "application/pdf", [])]);
  assert.equal(result.rejected[0].reason, "empty file");
});

test("unsupported type rejected even with PDF magic bytes", async (t) => {
  const result = await validateFiles([fileLike("notes.txt", "text/plain", [0x25, 0x50, 0x44, 0x46, 0x2D])]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected[0].reason, "unsupported type");
});

test("oversized file -> too large without reading bytes", async (t) => {
  const huge = {
    name: "huge.pdf",
    type: "application/pdf",
    size: 600e9,
    slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
  };
  const result = await validateFiles([huge]);
  assert.equal(result.rejected[0].reason, "too large");
});

test("mixed batch reports valid and rejected together, never throws", async (t) => {
  const pdf = fileLike("report.pdf", "application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2D]);
  const result = await validateFiles([pdf, fileLike("bad.pdf", "application/pdf", [1, 2, 3])]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.rejected.length, 1);
});

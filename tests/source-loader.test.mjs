import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceLoader } from "../js/core/source-loader.js";

// A real, minimal 1x1 opaque white PNG (base64-encoded).
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAAAAAABVgNqpjQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function file(bytes, { type, name }) {
  return {
    type,
    name,
    size: bytes.length,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  };
}

function loader(overrides = {}) {
  return createSourceLoader({
    decodeImage: async () => ({ width: 1, height: 1 }),
    ...overrides,
  });
}

test("loadFile parses a PDF into pages with baseRotation and natural size", async (t) => {
  const load = loader({
    loadPdf: async () => ({
      numPages: 2,
      getPage: () => ({
        rotate: 90,
        getViewport: () => ({ width: 792, height: 612 }),
      }),
    }),
  });
  const loaded = await load.loadFile(file(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { type: "application/pdf", name: "a.pdf" }));
  assert.equal(loaded.kind, "pdf");
  assert.equal(loaded.pageCount, 2);
  assert.equal(loaded.pages.length, 2);
  assert.equal(loaded.pages[0].index, 0);
  assert.equal(loaded.pages[0].baseRotation, 90);
  assert.equal(loaded.pages[0].width, 792);
  assert.equal(loaded.pages[1].index, 1);
  assert.equal(loaded.pages[1].baseRotation, 90);
  assert.equal(loaded.size, 4);
  assert.deepStrictEqual([...loaded.bytes], [0x25, 0x50, 0x44, 0x46]);
});

test("loadFile passes a copy of the bytes to loadPdf", async (t) => {
  let received;
  const load = loader({
    loadPdf: async (bytes) => {
      received = bytes;
      return { numPages: 1, getPage: () => ({ rotate: 0, getViewport: () => ({ width: 10, height: 10 }) }) };
    },
  });
  const original = new Uint8Array([1, 2, 3]);
  await load.loadFile(file(original, { type: "application/pdf", name: "a.pdf" }));
  received[0] = 99;
  assert.equal(original[0], 1);
});

test("loadFile decodes an image into a single-page source", async (t) => {
  const load = loader({
    loadPdf: async () => {
      throw new Error("pdf.js must not be used for an image");
    },
  });
  const loaded = await load.loadFile(file(PNG_1X1, { type: "image/png", name: "a.png" }));
  assert.equal(loaded.kind, "image");
  assert.equal(loaded.pageCount, 1);
  assert.equal(loaded.width, 1);
  assert.equal(loaded.height, 1);
  assert.equal(loaded.imageBitmap.width, 1);
  assert.equal(loaded.imageBitmap.height, 1);
});

test("loadFile surfaces pdf.js failures so callers can report password/corrupt errors", async (t) => {
  const load = loader({
    loadPdf: async () => {
      throw new Error("File is encrypted");
    },
  });
  await assert.rejects(
    load.loadFile(file(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { type: "application/pdf", name: "secret.pdf" })),
    /encrypted/,
  );
});

test("loadFile gives an image source a single entry in its pages list", async (t) => {
  const load = loader({
    loadPdf: async () => {
      throw new Error("pdf.js must not be used for an image");
    },
    decodeImage: async () => ({ width: 7, height: 5 }),
  });
  const loaded = await load.loadFile(file(PNG_1X1, { type: "image/png", name: "a.png" }));
  assert.equal(loaded.kind, "image");
  assert.deepStrictEqual(loaded.pages, [{ index: 0, baseRotation: 0, width: 7, height: 5 }]);
});

test("loadFile throws when the PDF has no pages", async (t) => {
  const load = loader({
    loadPdf: async () => ({ numPages: 0, getPage: () => ({}) }),
  });
  await assert.rejects(
    load.loadFile(file(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { type: "application/pdf", name: "empty.pdf" })),
    /no pages/,
  );
});

test("loadFile rejects corrupt PDFs", async (t) => {
  const load = loader({
    loadPdf: async () => {
      throw new Error("Invalid PDF structure");
    },
  });
  await assert.rejects(
    load.loadFile(file(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { type: "application/pdf", name: "bad.pdf" })),
    /Invalid PDF/,
  );
});

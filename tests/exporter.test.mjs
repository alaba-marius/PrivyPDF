import { test } from "node:test";
import assert from "node:assert/strict";
import { createExporter } from "../js/core/exporter.js";

function makePDFLib() {
  const ops = [];
  const pages = [];
  const PDFDocument = {
    async create() {
      ops.push(["create"]);
      return {
        setProducer(text) { ops.push(["producer", text]); },
        setCreator(text) { ops.push(["creator", text]); },
        addPage() {
          const p = { drawImage() {} };
          pages.push(p);
          return p;
        },
        async embedJpg(bytes) {
          ops.push(["embedJpg", bytes.length]);
          return {};
        },
        async embedPng(bytes) {
          ops.push(["embedPng", bytes.length]);
          return {};
        },
        async save() {
          ops.push(["save"]);
          return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        },
        async copyPages(_doc, indexes) {
          ops.push(["copy", ...indexes]);
          return indexes.map((index) => ({
            getRotation: () => ({ angle: 0 }),
            setRotation(angle) { ops.push(["setRotation", index, angle.angle ?? angle]); },
            drawImage() {},
          }));
        },
      };
    },
    async load(bytes) {
      ops.push(["load", bytes.length]);
      return {
        async copyPages(_doc, indexes) {
          ops.push(["copy", ...indexes]);
          return indexes.map((index) => ({
            getRotation: () => ({ angle: 0 }),
            setRotation(angle) { ops.push(["setRotation", index, angle.angle ?? angle]); },
            drawImage() {},
          }));
        },
      };
    },
  };
  return {
    ops,
    pages,
    PDFDocument,
    degrees: (angle) => ({ angle }),
    async embedJpg(bytes) {
      ops.push(["embedJpg", bytes.length]);
      return {};
    },
    async embedPng(bytes) {
      ops.push(["embedPng", bytes.length]);
      return {};
    },
  };
}

test("exportPages copies PDF pages and adds the user rotation on top of the file rotation", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 90 }];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([1, 2, 3]), type: "application/pdf", size: 3, pageCount: 1 }]]);
  const { name, bytes } = await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "report", exportMode: "all", selected: new Set(),
  });
  assert.equal(name, "report.pdf");
  assert.deepStrictEqual([...bytes], [0x25, 0x50, 0x44, 0x46]);
  assert.deepStrictEqual(PDFLib.ops, [
    ["create"],
    ["producer", "PrivyPDF"],
    ["creator", "PrivyPDF"],
    ["load", 3],
    ["copy", 0],
    ["setRotation", 0, 90],
    ["save"],
  ]);
});

test("exportPages exports only the selected pages in selected mode", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const pages = [
    { id: "p1", sourceId: "s1", index: 0, rotated: 0 },
    { id: "p2", sourceId: "s1", index: 1, rotated: 0 },
  ];
  const sources = new Map([["s1", { kind: "pdf", bytes: new Uint8Array([9]), type: "application/pdf", size: 1, pageCount: 2 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x", exportMode: "selected", selected: new Set(["p2"]),
  });
  assert.deepStrictEqual(PDFLib.ops.filter((o) => o[0] === "copy"), [["copy", 1]]);
});

test("exportPages embeds each image as its own page", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff]);
  const pages = [{ id: "p1", sourceId: "s1", index: 0, rotated: 0, width: 200, height: 300 }];
  const sources = new Map([["s1", { kind: "image", bytes: jpgBytes, type: "image/jpeg", width: 200, height: 300, size: 3, pageCount: 1 }]]);
  await exporter.exportPages({
    pages, getSource: (id) => sources.get(id), fileName: "x", exportMode: "all", selected: new Set(),
  });
  assert.deepStrictEqual(PDFLib.ops.filter((o) => o[0] === "embedJpg"), [["embedJpg", 3]]);
  assert.equal(PDFLib.pages.length, 1);
});

test("exportPages throws when a page has no source", async (t) => {
  const exporter = createExporter({ PDFLib: makePDFLib() });
  await assert.rejects(
    exporter.exportPages({
      pages: [{ id: "p1", sourceId: "s9", index: 0, rotated: 0 }],
      getSource: () => undefined,
      fileName: "x",
      exportMode: "all",
      selected: new Set(),
    }),
    /No source found/,
  );
});

test("exportPages sanitizes the output file name", async (t) => {
  const PDFLib = makePDFLib();
  const exporter = createExporter({ PDFLib });
  const { name } = await exporter.exportPages({
    pages: [{ id: "p1", sourceId: "s1", index: 0, rotated: 0 }],
    getSource: () => ({ kind: "pdf", bytes: new Uint8Array([1]), type: "application/pdf", size: 1, pageCount: 1 }),
    fileName: "weird/name*.pdf",
    exportMode: "all",
    selected: new Set(),
  });
  assert.equal(name, "weird_name_.pdf");
});

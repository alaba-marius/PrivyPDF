import * as pdfjs from "../vendor/pdfjs/pdf.min.js";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  StandardFonts,
  decodePDFRawStream,
} from "../vendor/pdf-lib/pdf-lib.esm.min.js";
import { exportPdf } from "../js/pdf-viewer.js";

pdfjs.GlobalWorkerOptions.workerSrc = "../vendor/pdfjs/pdf.worker.min.js";

const results = document.querySelector("#results");
const renders = document.querySelector("#renders");
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function operatorTokens(content) {
  const tokens = [];
  for (let index = 0; index < content.length;) {
    const character = content[index];
    if (/\s/.test(character)) {
      index++;
    } else if (character === "%") {
      while (index < content.length && content[index] !== "\n" && content[index] !== "\r") index++;
    } else if (character === "(") {
      let depth = 1;
      index++;
      while (index < content.length && depth) {
        if (content[index] === "\\") {
          index += 2;
        } else {
          if (content[index] === "(") depth++;
          if (content[index] === ")") depth--;
          index++;
        }
      }
      tokens.push("PDF_STRING");
    } else if (character === "<") {
      index++;
      if (content[index] === "<") {
        index++;
        tokens.push("<<");
      } else {
        while (index < content.length && content[index] !== ">") index++;
        index++;
        tokens.push("PDF_STRING");
      }
    } else if (character === ">") {
      index += content[index + 1] === ">" ? 2 : 1;
      if (content[index - 2] === ">") tokens.push(">>");
    } else if ("[]{}".includes(character)) {
      tokens.push(character);
      index++;
    } else if (character === "/") {
      index++;
      while (index < content.length && !/[\s()[\]{}<>/%]/.test(content[index])) index++;
    } else {
      const start = index;
      while (index < content.length && !/[\s()[\]{}<>/%]/.test(content[index])) index++;
      tokens.push(content.slice(start, index));
    }
  }
  return tokens;
}

function assertNoGraphicsTransformInText(content) {
  let inText = false;
  const tokens = operatorTokens(content);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "BT") inText = true;
    else if (token === "ET") inText = false;
    else if (token === "cm" && inText) {
      throw new Error("Found a cm operator inside a BT/ET text object.");
    }
    if (token === "TJ" && tokens[index - 1] !== "]") {
      throw new Error("Found a TJ operator without an array operand.");
    }
    if (token === "Tj" && tokens[index - 1] !== "PDF_STRING") {
      throw new Error("Found a Tj operator without a string operand.");
    }
  }
}

async function contentStreams(document, page) {
  const contents = document.context.lookup(page.node.Contents());
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((reference) => document.context.lookup(reference))
    : [contents];
  return streams.map((stream) =>
    new TextDecoder().decode(decodePDFRawStream(stream).decode())
  );
}

async function standardFontWidth(fontName, text, size) {
  const measurementDocument = await PDFDocument.create();
  const measurementPage = measurementDocument.addPage([1000, 1000]);
  const font = await measurementDocument.embedFont(fontName);
  measurementPage.drawText(text, { x: 0, y: 100, size, font });
  const task = pdfjs.getDocument({
    data: await measurementDocument.save(),
    isEvalSupported: false,
    standardFontDataUrl: "../vendor/pdfjs/standard_fonts/",
  });
  try {
    const measuredPdf = await task.promise;
    const items = (await (await measuredPdf.getPage(1)).getTextContent()).items
      .filter((item) => item.str);
    assert(items.map((item) => item.str).join("") === text, "Font metric fixture text changed.");
    return items.reduce((sum, item) => sum + item.width, 0);
  } finally {
    await task.destroy();
  }
}

async function renderAndCount(pdfPage, name, expectedBaseline, originalBaseline) {
  const viewport = pdfPage.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.setAttribute("aria-label", `${name} rendered page`);
  renders.append(canvas);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let expectedPixels = 0;
  let originalPixels = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (data[offset] > 245 && data[offset + 1] > 245 && data[offset + 2] > 245) continue;
      if (x < 35 || x > 285) continue;
      if (Math.abs(y - (canvas.height - expectedBaseline)) < 22) expectedPixels++;
      if (Math.abs(y - (canvas.height - originalBaseline)) < 22) originalPixels++;
    }
  }
  return { expectedPixels, originalPixels };
}

async function layoutFixtureBytes(withFollowingText = false) {
  const sourceBytes = new Uint8Array(
    await (await fetch("./layout-sample.pdf", { cache: "no-store" })).arrayBuffer()
  );
  if (!withFollowingText) return sourceBytes;
  const fixture = await PDFDocument.load(sourceBytes.slice());
  const fixturePage = fixture.getPage(0);
  const content = fixture.context.lookup(fixturePage.node.Contents());
  const sourceContent = new TextDecoder().decode(decodePDFRawStream(content).decode());
  assert(
    (sourceContent.match(/\bET\b/g) || []).length === 1,
    "The following-text fixture must contain one text-object terminator."
  );
  const extendedContent = sourceContent.replace(/\bET\b/, "/F1 20 Tf (Q) Tj /F1 24 Tf ET");
  fixturePage.node.set(
    PDFName.of("Contents"),
    fixture.context.register(fixture.context.flateStream(new TextEncoder().encode(extendedContent)))
  );
  return new Uint8Array(await fixture.save());
}

async function runCase({
  name,
  move,
  formatting = false,
  fontSize = 12,
  formattingRange = null,
  followingText = false,
}) {
  const sourceBytes = await layoutFixtureBytes(followingText);
  const sourceTask = pdfjs.getDocument({ data: sourceBytes.slice() });
  const sourcePdf = await sourceTask.promise;
  const sourcePage = await sourcePdf.getPage(1);
  const viewport = sourcePage.getViewport({ scale: 1 });
  const itemIndex = (await sourcePage.getTextContent()).items.findIndex(
    (item) => item.str === "Hello roadmap NEXT"
  );
  assert(
    itemIndex >= 0,
    `${name}: layout fixture text was not found (bytes=${sourceBytes.length}, items=${
      (await sourcePage.getTextContent()).items.map((item) => JSON.stringify(item.str)).join(", ")
    }).`
  );
  const sourceItem = (await sourcePage.getTextContent()).items[itemIndex];
  const [, , , , x, baseline] = sourceItem.transform;
  const sourceId = "movement-regression-source";
  const targetId = `pdf:${sourceId}:0:${itemIndex}`;
  const textEdit = {
    id: "movement-regression-edit",
    type: "text-edit",
    x: x / viewport.width,
    y: (viewport.height - baseline - sourceItem.height) / viewport.height,
    w: sourceItem.width / viewport.width,
    h: sourceItem.height * 1.25 / viewport.height,
    text: sourceItem.str,
    originalText: sourceItem.str,
    occurrenceIndex: 0,
    sourceTextId: targetId,
    fontSize: sourceItem.height,
    fontFamily: "Helvetica",
    fontWeight: "normal",
    fontStyle: "normal",
    color: "#010101",
    moveX: move ? 0.03 : 0,
    moveY: move ? 0.1 : 0,
  };
  const page = {
    id: "movement-regression-page",
    sourceId,
    index: 0,
    kind: "pdf",
    rotation: 0,
    width: viewport.width,
    height: viewport.height,
    annotations: [textEdit],
    formattingRanges: formatting
      ? [{
          textTargetId: targetId,
          text: sourceItem.str,
          start: formattingRange?.start ?? 0,
          end: formattingRange?.end ?? sourceItem.str.length,
          style: { fontSize, bold: true, italic: true },
        }]
      : [],
  };
  const outputBytes = await exportPdf(
    [page],
    new Map([[sourceId, { kind: "pdf", bytes: sourceBytes }]]),
    { title: name }
  );
  const outputPdf = await PDFDocument.load(outputBytes.slice());
  const outputPage = outputPdf.getPage(0);
  const streams = await contentStreams(outputPdf, outputPage);
  streams.forEach(assertNoGraphicsTransformInText);
  const fontResources = outputPdf.context
    .lookup(outputPdf.context.lookup(outputPage.node.Resources()).get(PDFName.Font));
  const fontNames = fontResources.keys().map((fontName) => fontName.toString());
  const expectedFont = "/PrivyRangeHelveticaBoldOblique";
  assert(
    formatting ? fontNames.includes(expectedFont) : !fontNames.includes(expectedFont),
    `${name}: unexpected exported font resources (${fontNames.join(", ")}).`
  );
  const content = streams.join("\n");
  if (!formattingRange) {
    assert(content.includes("Hello roadmap NEXT"), `${name}: exported text is missing.`);
  }

  const reopenedTask = pdfjs.getDocument({ data: outputBytes.slice() });
  const reopened = await reopenedTask.promise;
  assert(reopened.numPages === 1, `${name}: exported page count changed.`);
  const renderedPage = await reopened.getPage(1);
  const textItems = (await renderedPage.getTextContent()).items;
  const outputSegments = textItems.filter((item) => item.str && item.str !== "Q");
  const exportedText = outputSegments.map((item) => item.str).join("");
  assert(
    formattingRange ? exportedText === sourceItem.str : outputSegments.some((item) => item.str === sourceItem.str),
    `${name}: reopened PDF text extraction failed (${JSON.stringify(
      outputSegments.map((item) => ({ text: item.str, x: item.transform[4], width: item.width }))
    )}).`
  );
  const exportedItem = outputSegments.find((item) => item.str === sourceItem.str) || outputSegments[0];
  if (formatting && fontSize === 12 && !formattingRange) {
    const expectedNaturalWidth = await standardFontWidth(
      StandardFonts.HelveticaBoldOblique,
      sourceItem.str,
      fontSize
    );
    assert(
      Math.abs(exportedItem.width - expectedNaturalWidth) < 0.01,
      `${name}: glyph width was ${exportedItem.width}, expected natural width ${expectedNaturalWidth}.`
    );
    assert(
      exportedItem.width < sourceItem.width * 0.6,
      `${name}: formatted glyph width remained stretched (${exportedItem.width} vs ${sourceItem.width}).`
    );
  }
  const expectedBaseline = baseline - (move ? 40 : 0);
  const expectedX = x + (move ? 9 : 0);
  assert(
    Math.abs(exportedItem.transform[5] - expectedBaseline) < 0.02,
    `${name}: text baseline was ${exportedItem.transform[5]}, expected ${expectedBaseline}.`
  );
  assert(
    Math.abs(exportedItem.transform[4] - expectedX) < 0.02,
    `${name}: text x-position was ${exportedItem.transform[4]}, expected ${expectedX}.`
  );
  if (followingText) {
    const followingItem = textItems.find((item) => item.str === "Q");
    assert(followingItem, `${name}: the following text operation was not preserved.`);
    assert(
      Math.abs(followingItem.transform[4] - (x + sourceItem.width)) < 0.02,
      `${name}: following text started at ${followingItem.transform[4]}, expected ${
        x + sourceItem.width
      } (content: ${content}).`
    );
  }
  if (fontSize > 12 && formatting) {
    assert(
      exportedItem.width <= sourceItem.width + 0.02,
      `${name}: wider formatted text exceeded the original advance.`
    );
    assert(
      exportedItem.width >= sourceItem.width - 0.02,
      `${name}: wider formatted text no longer follows the original-width compression behavior.`
    );
  }
  if (formattingRange) {
    const visibleItems = textItems.filter((item) => item.str);
    assert(
      visibleItems.map((item) => item.str).join("") === sourceItem.str,
      `${name}: formatted and unformatted segments changed text order or content.`
    );
    assert(
      visibleItems.length >= 2,
      `${name}: mixed formatting did not remain split into styled and unstyled segments.`
    );
  }
  const pixels = await renderAndCount(
    renderedPage,
    name,
    expectedBaseline,
    baseline
  );
  assert(pixels.expectedPixels > 0, `${name}: rendered text is not visible at its expected position.`);
  if (move && !followingText) {
    assert(
      pixels.originalPixels === 0,
      `${name}: ${pixels.originalPixels} pixels remained visible at its original position.`
    );
  }
  await reopenedTask.destroy();
  await sourceTask.destroy();
  return {
    name,
    bytes: outputBytes.length,
    text: exportedItem.str,
    fontNames,
    baseline: exportedItem.transform[5],
    visiblePixels: pixels.expectedPixels,
  };
}

try {
  for (const scenario of [
    { name: "Movement only", move: true, formatting: false },
    { name: "Formatting only", move: false, formatting: true, followingText: true },
    { name: "Formatting and movement", move: true, formatting: true, followingText: true },
    { name: "Wider formatted text compression", move: false, formatting: true, fontSize: 48 },
    {
      name: "Mixed formatted and unformatted segments",
      move: false,
      formatting: true,
      formattingRange: { start: 6, end: 12 },
    },
  ]) {
    checks.push(await runCase(scenario));
  }
  results.className = "pass";
  results.textContent = `PASS\n${JSON.stringify(checks, null, 2)}`;
} catch (error) {
  results.className = "fail";
  results.textContent = `FAIL\n${error.stack || error}`;
  throw error;
}

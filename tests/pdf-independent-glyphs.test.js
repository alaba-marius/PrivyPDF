import * as pdfjs from "../vendor/pdfjs/pdf.min.js";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  StandardFonts,
  decodePDFRawStream,
} from "../vendor/pdf-lib/pdf-lib.esm.min.js";
import { exportPdf, validateTextEdit } from "../js/pdf-viewer.js";
import {
  renderIndependentGlyphPreview,
  renderFormattedTextAndRefreshStrikeMarks,
} from "../js/annotations.js";
import {
  canUseStrikeSelectionMetrics,
  fontMetricStrikeCenterY,
  hasCompatibleSingleBaselineRects,
  refreshStrikeMarkSvgLines,
  textMarkLineY,
} from "../js/text-marks.js";

pdfjs.GlobalWorkerOptions.workerSrc = "../vendor/pdfjs/pdf.worker.min.js";

const results = document.querySelector("#results");
const renders = document.querySelector("#renders");
const checks = [];
const textMarkDiagnosticsEnabled =
  new URLSearchParams(location.search).get("text-mark-diagnostics") === "1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readContent(document, page) {
  const contents = document.context.lookup(page.node.Contents());
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((reference) => document.context.lookup(reference))
    : [contents];
  return streams.map((stream) =>
    new TextDecoder().decode(decodePDFRawStream(stream).decode())
  );
}

async function fixtureBytes(transform = (content) => content) {
  const source = new Uint8Array(
    await (await fetch("./independent-glyphs.pdf", { cache: "no-store" })).arrayBuffer()
  );
  const document = await PDFDocument.load(source.slice());
  const page = document.getPage(0);
  const [content] = await readContent(document, page);
  const updatedContent = transform(content);
  if (updatedContent !== content) {
    page.node.set(
      PDFName.of("Contents"),
      document.context.register(
        document.context.flateStream(new TextEncoder().encode(updatedContent))
      )
    );
  }
  return new Uint8Array(await document.save());
}

function modelFor(sourceBytes, {
  ranges = [{ start: 0, end: 3, style: { fontSize: 25, bold: true, italic: true } }],
  annotations = [],
  move = false,
  resizeBox = false,
  omitSourceMatchGeometry = false,
  includeTextEdit = true,
  text = "ABC",
  sourceMatchWidth = 40.922,
} = {}) {
  const sourceId = "independent-glyph-source";
  const textTargetId = `pdf:${sourceId}:0:0`;
  const sourceMatchGeometry = {
    x: 48 / 300,
    y: (200 - 110 - 20) / 200,
    w: sourceMatchWidth / 300,
    h: 25 / 200,
    fontSize: 20,
  };
  const textEdit = {
    id: "independent-glyph-edit",
    type: "text-edit",
    x: sourceMatchGeometry.x + (resizeBox ? 0.01 : 0),
    y: sourceMatchGeometry.y + (resizeBox ? 0.015 : 0),
    w: sourceMatchGeometry.w * (resizeBox ? 1.75 : 1),
    h: sourceMatchGeometry.h * (resizeBox ? 1.5 : 1),
    text,
    originalText: text,
    occurrenceIndex: 0,
    sourceTextId: textTargetId,
    fontSize: 20,
    fontFamily: "Helvetica",
    fontWeight: "normal",
    fontStyle: "normal",
    color: "#171717",
    moveX: move ? 0.02 : 0,
    moveY: move ? 0.02 : 0,
    ...(!omitSourceMatchGeometry ? { sourceMatchGeometry } : {}),
  };
  return {
    sourceId,
    textTargetId,
    page: {
      id: "independent-glyph-page",
      sourceId,
      index: 0,
      kind: "pdf",
      rotation: 0,
      width: 300,
      height: 200,
      annotations: [...(includeTextEdit ? [textEdit] : []), ...annotations],
      formattingRanges: ranges.map((range) => ({
        ...range,
        textTargetId,
        text,
      })),
    },
    sources: new Map([[sourceId, { kind: "pdf", bytes: sourceBytes }]]),
  };
}

function measureStrikeRaster(canvas, segment, pageWidth, pageHeight) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const scaleX = canvas.width / pageWidth;
  const scaleY = canvas.height / pageHeight;
  const left = Math.max(0, Math.floor(segment.x * canvas.width));
  const right = Math.min(canvas.width, Math.ceil((segment.x + segment.w) * canvas.width));
  let strikePixelCount = 0;
  let glyphInkPixelCount = 0;
  let strikeYTotal = 0;
  let glyphTop = canvas.height;
  let glyphBottom = -1;
  let glyphLeft = canvas.width;
  let glyphRight = -1;
  let strikeTop = canvas.height;
  let strikeBottom = -1;
  let strikeLeft = canvas.width;
  let strikeRight = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * canvas.width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (red > 150 && green < 100 && blue < 100) {
        strikePixelCount++;
        strikeYTotal += y + 0.5;
        strikeTop = Math.min(strikeTop, y);
        strikeBottom = Math.max(strikeBottom, y + 1);
        strikeLeft = Math.min(strikeLeft, x);
        strikeRight = Math.max(strikeRight, x + 1);
      } else if (
        Math.max(red, green, blue) < 150 &&
        Math.max(red, green, blue) - Math.min(red, green, blue) < 35
      ) {
        glyphInkPixelCount++;
        glyphTop = Math.min(glyphTop, y);
        glyphBottom = Math.max(glyphBottom, y + 1);
        glyphLeft = Math.min(glyphLeft, x);
        glyphRight = Math.max(glyphRight, x + 1);
      }
    }
  }

  const strikeBounds = strikePixelCount
    ? { left: strikeLeft, top: strikeTop, right: strikeRight, bottom: strikeBottom }
    : null;
  const glyphInkBounds = glyphInkPixelCount
    ? { left: glyphLeft, top: glyphTop, right: glyphRight, bottom: glyphBottom }
    : null;
  const strikeCenterY = strikePixelCount ? strikeYTotal / strikePixelCount : null;
  const glyphCenterY = glyphInkBounds ? (glyphTop + glyphBottom) / 2 : null;

  return {
    rasterScale: { x: scaleX, y: scaleY },
    pixelClassification: {
      strike: "red channel > 150; green and blue < 100",
      glyph: "neutral pixel; all channels < 150; channel spread < 35",
    },
    strikePixelCount,
    strikePixelBounds: strikeBounds,
    measuredStrikeCenterTopDownPageUnits: strikeCenterY === null
      ? null
      : strikeCenterY / scaleY,
    glyphInkPixelCount,
    glyphInkPixelBounds: glyphInkBounds,
    measuredGlyphInkCenterTopDownPageUnits: glyphCenterY === null
      ? null
      : glyphCenterY / scaleY,
    measuredCenterDeltaPageUnits: strikeCenterY === null || glyphCenterY === null
      ? null
      : (strikeCenterY - glyphCenterY) / scaleY,
  };
}

async function exportAndInspect(sourceBytes, options = {}) {
  const model = modelFor(sourceBytes, options);
  const outputBytes = await exportPdf([model.page], model.sources, {
    title: "Independent glyph formatting regression",
  });
  const pdfDocument = await PDFDocument.load(outputBytes.slice());
  const page = pdfDocument.getPage(0);
  const streams = await readContent(pdfDocument, page);
  const fonts = pdfDocument.context.lookup(
    pdfDocument.context.lookup(page.node.Resources()).get(PDFName.Font)
  );
  const task = pdfjs.getDocument({
    data: outputBytes.slice(),
    standardFontDataUrl: "../vendor/pdfjs/standard_fonts/",
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const pdfPage = await pdf.getPage(1);
  const textItems = (await pdfPage.getTextContent()).items.filter((item) => item.str);
  const canvas = document.createElement("canvas");
  const viewport = pdfPage.getViewport({ scale: 1 });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.setAttribute("aria-label", "Independent glyph regression rendered page");
  renders.append(canvas);
  const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
  canvasContext.fillStyle = "#fff";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({
    canvasContext,
    viewport,
  }).promise;
  const spacingViewport = pdfPage.getViewport({ scale: 4 });
  const spacingCanvas = document.createElement("canvas");
  spacingCanvas.width = Math.ceil(spacingViewport.width);
  spacingCanvas.height = Math.ceil(spacingViewport.height);
  const spacingContext = spacingCanvas.getContext("2d", { willReadFrequently: true });
  spacingContext.fillStyle = "#fff";
  spacingContext.fillRect(0, 0, spacingCanvas.width, spacingCanvas.height);
  await pdfPage.render({
    canvasContext: spacingContext,
    viewport: spacingViewport,
  }).promise;
  return {
    outputBytes,
    document: pdfDocument,
    page,
    streams,
    fonts,
    textItems,
    canvas,
    spacingCanvas,
    task,
    model,
  };
}

async function previewGlyphBounds(model) {
  const annotation = model.page.annotations[0];
  const layout = await validateTextEdit(
    model.page,
    model.sources,
    annotation.id,
    { includePreviewLayout: true }
  );
  assert(layout, "The verified independent-glyph preview layout was not returned.");
  const pageElement = document.createElement("div");
  Object.assign(pageElement.style, {
    position: "relative",
    width: `${model.page.width}px`,
    height: `${model.page.height}px`,
  });
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "absolute",
    left: `${annotation.x * model.page.width}px`,
    top: `${annotation.y * model.page.height}px`,
    width: `${annotation.w * model.page.width}px`,
    height: `${annotation.h * model.page.height}px`,
    overflow: "hidden",
  });
  const root = document.createElement("span");
  overlay.append(root);
  pageElement.append(overlay);
  document.body.append(pageElement);
  assert(
    renderIndependentGlyphPreview(root, layout, annotation, model.page, 1),
    "Verified independent glyphs were not rendered in the editor preview."
  );
  const pageBounds = pageElement.getBoundingClientRect();
  const glyphBounds = [...root.children].map((span) => {
    const bounds = span.getBoundingClientRect();
    return {
      character: span.textContent,
      left: bounds.left - pageBounds.left,
      top: bounds.top - pageBounds.top,
      width: bounds.width,
      fontSize: Number.parseFloat(span.style.fontSize),
      fontWeight: span.style.fontWeight,
      fontStyle: span.style.fontStyle,
      scaleX: Number(span.style.transform.match(/scaleX\(([^)]+)\)/)?.[1]),
    };
  });
  const range = document.createRange();
  range.selectNodeContents(root);
  const selectionRects = [...range.getClientRects()].map((rect) => ({
    left: rect.left - pageBounds.left,
    top: rect.top - pageBounds.top,
    right: rect.right - pageBounds.left,
    bottom: rect.bottom - pageBounds.top,
    width: rect.width,
    height: rect.height,
  }));
  pageElement.remove();
  return { layout, glyphBounds, selectionRects };
}

function glyphShows(content) {
  return [...content.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)].flatMap(([, body]) => {
    const showMatch = /\(((?:\\.|[^\\)])*)\)\s*Tj\b/.exec(body);
    const matrixMatch =
      /([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+Tm\b/.exec(body);
    if (!showMatch || !matrixMatch) return [];
    const textShowIndex = showMatch.index;
    const fontMatches = [
      ...body.slice(0, textShowIndex).matchAll(/(\/[^\s]+)\s+([-+]?(?:\d+\.?\d*|\.\d+))\s+Tf\b/g),
    ];
    const horizontalScalesBefore = [
      ...body.slice(0, textShowIndex).matchAll(/([-+]?(?:\d+\.?\d*|\.\d+))\s+Tz\b/g),
    ].map((match) => Number(match[1]));
    const horizontalScalesAfter = [
      ...body.slice(textShowIndex + showMatch[0].length)
        .matchAll(/([-+]?(?:\d+\.?\d*|\.\d+))\s+Tz\b/g),
    ].map((match) => Number(match[1]));
    const fontMatch = fontMatches.at(-1);
    const character = showMatch[1]
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
    return [{
      character,
      matrix: matrixMatch.slice(1).map(Number),
      fontName: fontMatch?.[1] || null,
      fontSize: fontMatch ? Number(fontMatch[2]) : null,
      horizontalScalesBefore,
      horizontalScalesAfter,
    }];
  });
}

function occupiedColumnGroups(canvas, {
  left = 45,
  right = 100,
  top = 260,
  bottom = 365,
  scale = 4,
} = {}) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const occupied = [];
  for (let x = Math.floor(left * scale); x < Math.ceil(right * scale); x++) {
    let hasInk = false;
    for (let y = top; y < bottom; y++) {
      const offset = (y * canvas.width + x) * 4;
      if (
        pixels[offset] < 210 &&
        pixels[offset + 1] < 210 &&
        pixels[offset + 2] < 210
      ) {
        hasInk = true;
        break;
      }
    }
    occupied.push(hasInk);
  }
  let groups = 0;
  let previousOccupied = false;
  for (const hasInk of occupied) {
    if (hasInk && !previousOccupied) groups++;
    previousOccupied = hasInk;
  }
  return groups;
}

function assertOperatorsValid(content) {
  const tokens = content.match(/\[[^\]]*\]|\([^)]*(?:\\.[^)]*)*\)|\/?[^\s()[\]]+/g) || [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] === "Tj") {
      assert(
        /^\(/.test(tokens[index - 1] || ""),
        "A Tj operator does not have a string operand."
      );
    }
    if (tokens[index] === "TJ") {
      assert(
        /^\[/.test(tokens[index - 1] || ""),
        "A TJ operator does not have an array operand."
      );
    }
  }
}

async function assertRejected(sourceBytes, name, options = {}) {
  const model = modelFor(sourceBytes, options);
  let error = null;
  try {
    await exportPdf([model.page], model.sources, { title: name });
  } catch (caught) {
    error = caught;
  }
  assert(error, `${name}: export unexpectedly succeeded.`);
  assert(
    /safely|match|metric|font|position|source/i.test(error.message),
    `${name}: export failed without an explicit safety error (${error.message}).`
  );
  checks.push({ name, result: error.message });
}

try {
  const sourceBytes = await fixtureBytes();
  const sourceDocument = await PDFDocument.load(sourceBytes.slice());
  const [sourceContent] = await readContent(sourceDocument, sourceDocument.getPage(0));
  const sourcePageTask = pdfjs.getDocument({
    data: sourceBytes.slice(),
    standardFontDataUrl: "../vendor/pdfjs/standard_fonts/",
  });
  const sourcePdf = await sourcePageTask.promise;
  const sourceItems = (await (await sourcePdf.getPage(1)).getTextContent()).items
    .filter((item) => item.str);
  const sourceGlyphs = glyphShows(sourceContent);
  assert(
    sourceItems.map((item) => item.str).join("") === "ABC" &&
      sourceGlyphs.map((item) => item.character).join("") === "ABC",
    "The source fixture must expose three glyphs in source order."
  );
  assert(
    sourceGlyphs.length === 3,
    `Expected three independently positioned source glyphs; found ${sourceGlyphs.length}.`
  );
  const sourcePdfPage = await sourcePdf.getPage(1);
  const sourceViewport = sourcePdfPage.getViewport({ scale: 1 });
  const sourceTextStyle = (await sourcePdfPage.getTextContent()).styles[
    sourceItems[0].fontName
  ];
  const sourceTextTransform = pdfjs.Util.transform(
    sourceViewport.transform,
    sourceItems[0].transform
  );
  const sourceFontSize = Math.hypot(sourceTextTransform[2], sourceTextTransform[3]);
  const sourceStrikeCenterY = fontMetricStrikeCenterY({
    baselineY: sourceTextTransform[5],
    fontSize: sourceFontSize,
    ascent: sourceTextStyle.ascent,
    descent: sourceTextStyle.descent,
    verticalDirection: Math.sign(sourceTextTransform[3]),
    pageHeight: 200,
  });
  const unformattedStrikeSegment = {
    x: 48 / 300,
    y: (sourceTextTransform[5] - sourceFontSize) / 200,
    w: sourceItems[0].width / 300,
    h: sourceFontSize / 200,
  };
  const metricStrike = {
    type: "draw",
    tool: "annotate-strike",
    color: "#ff0000",
    width: 2,
    strikeCenterY: sourceStrikeCenterY,
    textTargetText: "ABC",
    textTarget: { kind: "pdf", id: "pdf:independent-glyph-source:0:0" },
    textRange: { start: 0, end: 3 },
    strikeMetrics: {
      baselineY: sourceTextTransform[5],
      fontSize: sourceFontSize,
      ascent: sourceTextStyle.ascent,
      descent: sourceTextStyle.descent,
      verticalDirection: Math.sign(sourceTextTransform[3]),
      pageHeight: 200,
      fontFamily: "Helvetica",
      bold: false,
      italic: false,
    },
    segments: [unformattedStrikeSegment],
  };
  const unformattedStrike = await exportAndInspect(sourceBytes, {
    ranges: [],
    includeTextEdit: false,
    annotations: [metricStrike],
  });
  const unformattedStrikeRaster = measureStrikeRaster(
    unformattedStrike.spacingCanvas,
    unformattedStrikeSegment,
    300,
    200
  );
  const measuredInkCenter =
    unformattedStrikeRaster.measuredGlyphInkCenterTopDownPageUnits;
  const metricCenter = textMarkLineY(metricStrike, unformattedStrikeSegment) * 200;
  const selectionBoxCenter = textMarkLineY(
    { tool: "annotate-strike" },
    unformattedStrikeSegment
  ) * 200;
  assert(
    sourceTextStyle.ascent > 0 &&
      sourceTextStyle.descent < 0 &&
      unformattedStrikeRaster.strikePixelCount > 0 &&
      unformattedStrikeRaster.glyphInkPixelCount > 0,
    `The source font metrics or unformatted text raster were not measurable: ${
      JSON.stringify({ sourceTextStyle, unformattedStrikeRaster })
    }.`
  );
  assert(
    Math.abs(
      unformattedStrikeRaster.measuredStrikeCenterTopDownPageUnits -
        unformattedStrikeRaster.measuredGlyphInkCenterTopDownPageUnits
    ) <= 1.5,
    `The exported unformatted strike was not centered on visible glyph ink (${
      JSON.stringify(unformattedStrikeRaster)
    }).`
  );
  assert(
    Math.abs(metricCenter - measuredInkCenter) <
      Math.abs(selectionBoxCenter - measuredInkCenter),
    `Font-metric alignment did not improve the unformatted glyph-ink center distance (${
      JSON.stringify({
        metricCenter,
        selectionBoxCenter,
        measuredInkCenter,
      })
    }).`
  );
  assert(
    textMarkLineY({ tool: "annotate-strike" }, unformattedStrikeSegment) ===
      unformattedStrikeSegment.y + unformattedStrikeSegment.h * 0.52,
    "Strikethrough without verified source font metrics did not retain the safe fallback."
  );
  assert(
    fontMetricStrikeCenterY({
      baselineY: sourceTextTransform[5],
      fontSize: sourceFontSize,
      ascent: sourceTextStyle.ascent,
      descent: Number.NaN,
      verticalDirection: Math.sign(sourceTextTransform[3]),
      pageHeight: 200,
    }) === null &&
      textMarkLineY({ tool: "annotate-underline" }, unformattedStrikeSegment) ===
        unformattedStrikeSegment.y + unformattedStrikeSegment.h * 0.9,
    "Missing source metrics or ordinary underline positioning did not use its existing safe behavior."
  );
  assert(
    fontMetricStrikeCenterY({
      baselineY: 100,
      fontSize: 20,
      ascent: 0.7,
      descent: -0.2,
      verticalDirection: 1,
      pageHeight: 200,
    }) === 0.535,
    "The source baseline's opposite vertical direction was not accounted for."
  );
  checks.push({
    name: "Unformatted independent glyph strikethrough",
    fontAscent: sourceTextStyle.ascent,
    fontDescent: sourceTextStyle.descent,
    sourceFontSize,
    metricStrikeCenterTopDownPageUnits: metricCenter,
    selectionBoxStrikeCenterTopDownPageUnits: selectionBoxCenter,
    measuredGlyphInkCenterTopDownPageUnits: measuredInkCenter,
    measuredMetricCenterDelta: metricCenter - measuredInkCenter,
    measuredSelectionBoxCenterDelta: selectionBoxCenter - measuredInkCenter,
  });
  await unformattedStrike.task.destroy();

  const sourceStrikeMetrics = {
    baselineY: sourceTextTransform[5],
    fontSize: sourceFontSize,
    ascent: sourceTextStyle.ascent,
    descent: sourceTextStyle.descent,
    verticalDirection: Math.sign(sourceTextTransform[3]),
    pageHeight: 200,
    fontFamily: "Arial",
  };
  const formattingTargetId = "pdf:independent-glyph-source:0:0";
  const formattedStrikeRanges = [{
    start: 0,
    end: 3,
    style: { fontSize: 25, bold: true, italic: true },
  }];
  const formatDependentStrike = {
    ...metricStrike,
    textTarget: { kind: "pdf", id: formattingTargetId },
    textRange: { start: 0, end: 3 },
    strikeMetrics: { ...sourceStrikeMetrics, fontFamily: "Helvetica" },
    textTargetText: "ABC",
  };
  const sourceOnlyCenter = textMarkLineY(
    formatDependentStrike,
    unformattedStrikeSegment
  );
  const expectedFormattedStrikeCenter = textMarkLineY(
    { ...formatDependentStrike, strikeCenterY: undefined },
    unformattedStrikeSegment,
    formattedStrikeRanges.map((range) => ({
      ...range,
      text: "ABC",
      textTargetId: formattingTargetId,
    }))
  );
  const textTargetFormattingRanges = formattedStrikeRanges.map((range) => ({
    ...range,
    text: "ABC",
    textTargetId: formattingTargetId,
  }));
  const strikeFirstCenter = textMarkLineY(
    formatDependentStrike,
    unformattedStrikeSegment,
    textTargetFormattingRanges
  );
  const formatFirstCenter = textMarkLineY(
    { ...formatDependentStrike, strikeCenterY: undefined },
    unformattedStrikeSegment,
    textTargetFormattingRanges
  );
  assert(
    Math.abs(strikeFirstCenter - formatFirstCenter) < 0.000001 &&
      Math.abs(formatFirstCenter - expectedFormattedStrikeCenter) < 0.000001,
    "Formatting order produced different calculated positions for the final 25 pt style."
  );
  assert(
    textMarkLineY(
      formatDependentStrike,
      unformattedStrikeSegment,
      [
        { start: 0, end: 1, style: { fontSize: 25 }, text: "ABC", textTargetId: formattingTargetId },
        { start: 1, end: 3, style: { fontSize: 24 }, text: "ABC", textTargetId: formattingTargetId },
      ]
    ) === sourceStrikeCenterY,
    "Mixed font sizes within a strike range did not retain the safe source-metric fallback."
  );
  const strikeThenFormat = await exportAndInspect(sourceBytes, {
    ranges: formattedStrikeRanges,
    annotations: [formatDependentStrike],
  });
  const formatThenStrike = await exportAndInspect(sourceBytes, {
    ranges: formattedStrikeRanges,
    annotations: [{ ...formatDependentStrike, strikeCenterY: undefined }],
  });
  const strikeThenFormatRaster = measureStrikeRaster(
    strikeThenFormat.spacingCanvas,
    unformattedStrikeSegment,
    300,
    200
  );
  const formatThenStrikeRaster = measureStrikeRaster(
    formatThenStrike.spacingCanvas,
    unformattedStrikeSegment,
    300,
    200
  );
  assert(
    strikeThenFormatRaster.strikePixelCount > 0 &&
      formatThenStrikeRaster.strikePixelCount > 0 &&
      Math.abs(
        strikeThenFormatRaster.measuredStrikeCenterTopDownPageUnits -
          strikeThenFormatRaster.measuredGlyphInkCenterTopDownPageUnits
      ) <= 1.5 &&
      Math.abs(
        formatThenStrikeRaster.measuredStrikeCenterTopDownPageUnits -
          formatThenStrikeRaster.measuredGlyphInkCenterTopDownPageUnits
      ) <= 1.5 &&
      Math.abs(
        strikeThenFormatRaster.measuredStrikeCenterTopDownPageUnits -
          formatThenStrikeRaster.measuredStrikeCenterTopDownPageUnits
      ) <= 0.5,
    `Formatting order changed the exported strikethrough position (${
      JSON.stringify({
        strikeThenFormat: strikeThenFormatRaster.measuredStrikeCenterTopDownPageUnits,
        strikeThenFormatInk: strikeThenFormatRaster.measuredGlyphInkCenterTopDownPageUnits,
        formatThenStrike: formatThenStrikeRaster.measuredStrikeCenterTopDownPageUnits,
        formatThenStrikeInk: formatThenStrikeRaster.measuredGlyphInkCenterTopDownPageUnits,
      })
    }).`
  );
  checks.push({
    name: "Strikethrough formatting-order alignment",
    sourceOnlyCenterTopDownPageUnits: sourceOnlyCenter * 200,
    formattedTextMetricsCenterTopDownPageUnits: expectedFormattedStrikeCenter * 200,
    strikeThenFormatRasterCenter:
      strikeThenFormatRaster.measuredStrikeCenterTopDownPageUnits,
    strikeThenFormatVisibleInkCenter:
      strikeThenFormatRaster.measuredGlyphInkCenterTopDownPageUnits,
    formatThenStrikeRasterCenter:
      formatThenStrikeRaster.measuredStrikeCenterTopDownPageUnits,
    formatThenStrikeVisibleInkCenter:
      formatThenStrikeRaster.measuredGlyphInkCenterTopDownPageUnits,
  });
  await strikeThenFormat.task.destroy();
  await formatThenStrike.task.destroy();

  const descenderBytes = await fixtureBytes((content) =>
    content
      .replace("(A) Tj", "(g) Tj")
      .replace("(B) Tj", "(y) Tj")
      .replace("(C) Tj", "(p) Tj")
  );
  const descenderSource = await PDFDocument.load(descenderBytes.slice());
  const [descenderContent] = await readContent(
    descenderSource,
    descenderSource.getPage(0)
  );
  const descenderSourceGlyphs = glyphShows(descenderContent);
  assert(
    descenderSourceGlyphs.map((glyph) => glyph.character).join("") === "gyp",
    "The ink-alignment fixture must contain descenders in source order."
  );
  const descenderMetricFont = await descenderSource.embedFont(StandardFonts.Helvetica);
  const finalDescender = descenderSourceGlyphs.at(-1);
  const descenderSourceAdvance = descenderMetricFont.widthOfTextAtSize(
    finalDescender.character,
    20
  );
  const descenderMatchWidth =
    finalDescender.matrix[4] -
    descenderSourceGlyphs[0].matrix[4] +
    descenderSourceAdvance * finalDescender.matrix[0];
  const descenderTask = pdfjs.getDocument({
    data: descenderBytes.slice(),
    standardFontDataUrl: "../vendor/pdfjs/standard_fonts/",
  });
  const descenderPdf = await descenderTask.promise;
  const descenderPage = await descenderPdf.getPage(1);
  const descenderTextContent = await descenderPage.getTextContent();
  const descenderText = descenderTextContent.items.find((item) => item.str);
  assert(descenderText, "PDF.js could not extract the descender fixture text.");
  const descenderStyle = descenderTextContent.styles[descenderText.fontName];
  const descenderTransform = pdfjs.Util.transform(
    descenderPage.getViewport({ scale: 1 }).transform,
    descenderText.transform
  );
  const descenderMetrics = {
    baselineY: descenderTransform[5],
    fontSize: Math.hypot(descenderTransform[2], descenderTransform[3]),
    ascent: descenderStyle.ascent,
    descent: descenderStyle.descent,
    verticalDirection: Math.sign(descenderTransform[3]),
    pageHeight: 200,
    fontFamily: "Helvetica",
    bold: false,
    italic: false,
  };
  const descenderSegment = {
    ...unformattedStrikeSegment,
    w: 45 / 300,
  };
  const descenderStrike = {
    ...metricStrike,
    textTargetText: "gyp",
    textRange: { start: 0, end: 3 },
    strikeMetrics: descenderMetrics,
    strikeCenterY: fontMetricStrikeCenterY(descenderMetrics),
    segments: [descenderSegment],
  };
  const descenderExport = await exportAndInspect(descenderBytes, {
    text: "gyp",
    ranges: [{ start: 0, end: 3, style: { fontSize: 25, bold: true, italic: true } }],
    annotations: [descenderStrike],
    sourceMatchWidth: descenderMatchWidth,
  });
  const descenderRaster = measureStrikeRaster(
    descenderExport.spacingCanvas,
    descenderSegment,
    300,
    200
  );
  const sourceAscentEstimate =
    fontMetricStrikeCenterY({ ...descenderMetrics, fontSize: 25 }) * 200;
  const previewStrikeCenter =
    textMarkLineY(
      descenderStrike,
      descenderSegment,
      descenderExport.model.page.formattingRanges
    ) * 200;
  assert(
    descenderRaster.strikePixelCount > 0 &&
      descenderRaster.glyphInkPixelCount > 0 &&
      Math.abs(
        descenderRaster.measuredStrikeCenterTopDownPageUnits -
          previewStrikeCenter
      ) <= 0.5 &&
      Math.abs(
        descenderRaster.measuredStrikeCenterTopDownPageUnits -
          descenderRaster.measuredGlyphInkCenterTopDownPageUnits
      ) <= 1.5 &&
      Math.abs(
        sourceAscentEstimate -
          descenderRaster.measuredGlyphInkCenterTopDownPageUnits
      ) > 1.5,
    `The exported formatted strikethrough did not follow visible descender ink (${
      JSON.stringify({ descenderRaster, sourceAscentEstimate })
    }).`
  );
  checks.push({
    name: "Rendered-ink alignment with formatted descenders",
    sourceAscentEstimate,
    previewAndExportLineCenter: previewStrikeCenter,
    measuredStrikeCenter: descenderRaster.measuredStrikeCenterTopDownPageUnits,
    measuredGlyphInkCenter: descenderRaster.measuredGlyphInkCenterTopDownPageUnits,
    centerDelta:
      descenderRaster.measuredStrikeCenterTopDownPageUnits -
      descenderRaster.measuredGlyphInkCenterTopDownPageUnits,
  });
  await descenderExport.task.destroy();
  await descenderTask.destroy();

  const sourceMetricFont = await sourceDocument.embedFont(StandardFonts.Helvetica);
  const requestedMetricFont = await sourceDocument.embedFont(StandardFonts.HelveticaBoldOblique);
  const sourceAdvances = sourceGlyphs.map((glyph) =>
    sourceMetricFont.widthOfTextAtSize(glyph.character, 20)
  );
  const requestedAdvances = sourceGlyphs.map((glyph) =>
    requestedMetricFont.widthOfTextAtSize(glyph.character, 25)
  );
  for (let index = 0; index < sourceGlyphs.length - 1; index++) {
    const measuredInterval =
      (sourceGlyphs[index + 1].matrix[4] - sourceGlyphs[index].matrix[4]) /
      sourceGlyphs[index].matrix[0];
    assert(
      Math.abs(measuredInterval - sourceAdvances[index]) < 0.001,
      `Source glyph ${sourceGlyphs[index].character} advance does not match its next origin.`
    );
  }
  const multiRectStrikeSegments = sourceGlyphs.map((glyph, index) => {
    const right = index + 1 < sourceGlyphs.length
      ? sourceGlyphs[index + 1].matrix[4]
      : glyph.matrix[4] + sourceAdvances[index] * glyph.matrix[0];
    return {
      x: glyph.matrix[4] / 300,
      y: unformattedStrikeSegment.y,
      w: (right - glyph.matrix[4]) / 300,
      h: unformattedStrikeSegment.h,
    };
  });
  const multiRectStrike = {
    ...formatDependentStrike,
    strikeCenterY: undefined,
    segments: multiRectStrikeSegments,
  };
  const multiRectExport = await exportAndInspect(sourceBytes, {
    ranges: formattedStrikeRanges,
    annotations: [multiRectStrike],
  });
  const multiRectRaster = measureStrikeRaster(
    multiRectExport.spacingCanvas,
    {
      ...multiRectStrikeSegments[0],
      w:
        multiRectStrikeSegments.at(-1).x +
        multiRectStrikeSegments.at(-1).w -
        multiRectStrikeSegments[0].x,
    },
    300,
    200
  );
  assert(
    multiRectRaster.strikePixelCount > 0 &&
      multiRectRaster.glyphInkPixelCount > 0 &&
      Math.abs(
        multiRectRaster.measuredStrikeCenterTopDownPageUnits -
          multiRectRaster.measuredGlyphInkCenterTopDownPageUnits
      ) <= 1.5,
    `The multi-rectangle formatted selection did not align with reopened PDF.js glyph ink (${
      JSON.stringify(multiRectRaster)
    }).`
  );
  checks.push({
    name: "Multi-rectangle formatted strike against reopened PDF.js ink",
    segmentCount: multiRectStrikeSegments.length,
    measuredStrikeCenter: multiRectRaster.measuredStrikeCenterTopDownPageUnits,
    measuredGlyphInkCenter: multiRectRaster.measuredGlyphInkCenterTopDownPageUnits,
    centerDelta: multiRectRaster.measuredCenterDeltaPageUnits,
  });
  await multiRectExport.task.destroy();

  const formatted = await exportAndInspect(sourceBytes, {
    resizeBox: true,
    annotations: [{
      type: "draw",
      tool: "annotate-strike",
      color: "#ff0000",
      width: 2,
      segments: [{ x: 0.16, y: 0.43, w: 0.15, h: 0.08 }],
    }],
  });
  const formattedContent = formatted.streams.join("\n");
  const formattedGlyphs = glyphShows(formattedContent);
  const extractedFormattedText = formatted.textItems.map((item) => item.str).join("");
  assert(
    extractedFormattedText.replace(/\s/g, "") === "ABC" &&
      formattedGlyphs.map((item) => item.character).join("") === "ABC",
    `Formatted output changed glyph order or content (PDF.js: ${
      extractedFormattedText
    }; operators: ${JSON.stringify(formattedGlyphs)}; stream: ${formattedContent}).`
  );
  assert(
    formattedGlyphs.length === 3,
    `Expected three exported glyph shows; found ${
      formattedGlyphs.length
    }.`
  );
  assert(
    formatted.fonts.keys().some((name) =>
      name.toString() === "/PrivyRangeHelveticaBoldOblique"
    ),
    "The bold-italic standard font resource was not added."
  );
  for (let index = 0; index < sourceGlyphs.length; index++) {
    const sourceGlyph = sourceGlyphs[index];
    const outputGlyph = formattedGlyphs[index];
    assert(
      outputGlyph.character === sourceGlyph.character &&
        outputGlyph.matrix.every(
          (value, matrixIndex) => Math.abs(value - sourceGlyph.matrix[matrixIndex]) < 0.00001
        ),
      `Glyph ${sourceGlyph.character} changed its original text matrix.`
    );
    assert(
      outputGlyph.fontName === "/PrivyRangeHelveticaBoldOblique" &&
        outputGlyph.fontSize === 25,
      `Glyph ${outputGlyph.character} did not use 25 pt Helvetica bold italic (${outputGlyph.fontName}, ${outputGlyph.fontSize}).`
    );
    const expectedTz = sourceAdvances[index] / requestedAdvances[index] * 100;
    assert(
      outputGlyph.horizontalScalesBefore.length === 1 &&
        Math.abs(outputGlyph.horizontalScalesBefore[0] - expectedTz) < 0.001 &&
        outputGlyph.horizontalScalesAfter.length === 1 &&
        Math.abs(outputGlyph.horizontalScalesAfter[0] - 100) < 0.001,
      `Glyph ${outputGlyph.character} did not use its measured width compensation and restore source Tz.`
    );
    const compensatedAdvance =
      requestedAdvances[index] *
      outputGlyph.horizontalScalesBefore[0] / 100 *
      sourceGlyph.matrix[0];
    const sourceInterval = sourceAdvances[index] * sourceGlyph.matrix[0];
    assert(
      Math.abs(compensatedAdvance - sourceInterval) < 0.001,
      `Glyph ${outputGlyph.character} compensation does not preserve its source interval.`
    );
  }
  const formattedPreview = await previewGlyphBounds(formatted.model);
  assert(
    formattedPreview.glyphBounds.length === sourceGlyphs.length,
    "The editor preview omitted or duplicated an independently positioned glyph."
  );
  for (let index = 0; index < sourceGlyphs.length; index++) {
    const sourceGlyph = sourceGlyphs[index];
    const previewGlyph = formattedPreview.glyphBounds[index];
    const expectedAdvance = sourceAdvances[index] * sourceGlyph.matrix[0];
    assert(
      previewGlyph.character === sourceGlyph.character &&
        Math.abs(previewGlyph.left - sourceGlyph.matrix[4]) < 0.01 &&
        Math.abs(previewGlyph.width - expectedAdvance) < 0.05 &&
        previewGlyph.fontSize === 25 &&
        previewGlyph.fontWeight === "bold" &&
        previewGlyph.fontStyle === "italic",
      `Editor preview glyph ${sourceGlyph.character} did not match its exported origin, width, or style.`
    );
    assert(
      Math.abs(formattedPreview.layout.glyphs[index].baselineY - 110) < 0.001,
      `Editor preview glyph ${sourceGlyph.character} changed its source baseline.`
    );
  }
  assert(
    formattedPreview.selectionRects.length > 1 &&
      hasCompatibleSingleBaselineRects(formattedPreview.selectionRects) &&
      canUseStrikeSelectionMetrics({
        segmentCount: formattedPreview.selectionRects.length,
        rectangleCount: formattedPreview.selectionRects.length,
        candidateCount: 1,
        targetId: formattingTargetId,
        targetKind: "pdf",
        strikeMetrics: sourceStrikeMetrics,
        rects: formattedPreview.selectionRects,
      }),
    "Formatting first then striking independently positioned glyphs did not retain compatible multi-rectangle baseline geometry."
  );
  assert(
    !canUseStrikeSelectionMetrics({
      segmentCount: 2,
      rectangleCount: 2,
      candidateCount: 2,
      targetId: formattingTargetId,
      targetKind: "pdf",
      strikeMetrics: sourceStrikeMetrics,
      rects: [
        { left: 10, right: 20, top: 10, bottom: 30 },
        { left: 20, right: 30, top: 10, bottom: 30 },
      ],
    }) &&
      !canUseStrikeSelectionMetrics({
        segmentCount: 2,
        rectangleCount: 2,
        candidateCount: 1,
        targetId: formattingTargetId,
        targetKind: "pdf",
        rects: formattedPreview.selectionRects,
      }) &&
      !hasCompatibleSingleBaselineRects([
        { left: 10, right: 20, top: 10, bottom: 30 },
        { left: 20, right: 30, top: 35, bottom: 55 },
      ]) &&
      !hasCompatibleSingleBaselineRects([
        { left: 10, right: 20, top: 10, bottom: 30 },
        { left: 20, right: 30, top: 10, bottom: Number.NaN },
      ]),
    "Multi-line or invalid selection geometry was accepted for metric-based strikethrough."
  );
  const refreshSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (let index = 0; index < 2; index++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", "0,0 1,1");
    refreshSvg.append(line);
  }
  let formattedTextRenderCount = 0;
  const serializePoints = (points) =>
    points.map(({ x, y }) => `${x},${y}`).join(" ");
  renderFormattedTextAndRefreshStrikeMarks(
    null,
    () => { formattedTextRenderCount++; },
    () => refreshStrikeMarkSvgLines(
      refreshSvg,
      formatDependentStrike,
      textTargetFormattingRanges,
      0,
      serializePoints
    )
  );
  const expectedRefreshedPoints = serializePoints([
    {
      x: unformattedStrikeSegment.x,
      y: textMarkLineY(
        formatDependentStrike,
        unformattedStrikeSegment,
        textTargetFormattingRanges
      ),
    },
    {
      x: unformattedStrikeSegment.x + unformattedStrikeSegment.w,
      y: textMarkLineY(
        formatDependentStrike,
        unformattedStrikeSegment,
        textTargetFormattingRanges
      ),
    },
  ]);
  assert(
    formattedTextRenderCount === 0 &&
      [...refreshSvg.querySelectorAll("polyline")].every(
        (line) =>
          line.getAttribute("points") === expectedRefreshedPoints &&
          line.getAttribute("points") !== "0,0 1,1"
      ),
    "Formatting without an inline-edit text node did not refresh the existing strike line."
  );
  checks.push({
    name: "Formatting-first selection geometry and strike-first preview refresh",
    selectionRectangleCount: formattedPreview.selectionRects.length,
    compatibleBaseline: true,
    missingInlineEditTextRerenderCount: formattedTextRenderCount,
    refreshedLine: refreshSvg.querySelector("polyline")?.getAttribute("points"),
  });
  const formattedStream = formatted.streams.join("\n");
  assert(
    (formattedStream.match(
      /\/PrivyRangeHelveticaBoldOblique 25 Tf [-+]?(?:\d+\.?\d*|\.\d+) Tz \([^)]*\) Tj 100 Tz \/F1 20 Tf/g
    ) || []).length === 3,
    "Horizontal scaling or the source font state was not restored after every formatted glyph."
  );
  assert(
    !/\bTJ\b/.test(formattedStream),
    "Independent-glyph formatting introduced an unexpected text-array adjustment."
  );
  assertOperatorsValid(formattedStream);
  assert(
    formatted.model.page.annotations[0].moveX === 0 &&
      formatted.model.page.annotations[0].moveY === 0,
    "Resizing the transform box introduced a text movement offset."
  );
  const resizedEdit = formatted.model.page.annotations[0];
  const sourceGeometry = resizedEdit.sourceMatchGeometry;
  assert(
    resizedEdit.x !== sourceGeometry.x &&
      resizedEdit.y !== sourceGeometry.y &&
      resizedEdit.w !== sourceGeometry.w &&
      resizedEdit.h !== sourceGeometry.h,
    "The regression did not change the mutable transform-box geometry."
  );
  const canvasContext = formatted.canvas.getContext("2d", { willReadFrequently: true });
  const pixels = canvasContext.getImageData(0, 0, formatted.canvas.width, formatted.canvas.height).data;
  let visiblePixels = 0;
  let redMarkPixels = 0;
  for (let y = 0; y < formatted.canvas.height; y++) {
    for (let x = 0; x < formatted.canvas.width; x++) {
      const offset = (y * formatted.canvas.width + x) * 4;
      if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) {
        visiblePixels++;
      }
      if (
        y >= 92 &&
        y < 97 &&
        x >= 47 &&
        x < 95 &&
        pixels[offset] > 150 &&
        pixels[offset + 1] < 100 &&
        pixels[offset + 2] < 100
      ) {
        redMarkPixels++;
      }
    }
  }
  assert(visiblePixels > 0, "PDF.js rendered no visible page content.");
  assert(redMarkPixels > 0, "The independent strikethrough annotation was not rendered.");
  const strikeRasterDiagnostics = textMarkDiagnosticsEnabled
    ? measureStrikeRaster(
        formatted.spacingCanvas,
        formatted.model.page.annotations[1].segments[0],
        formatted.model.page.width,
        formatted.model.page.height
      )
    : null;
  if (strikeRasterDiagnostics) {
    assert(
      strikeRasterDiagnostics.strikePixelCount > 0 &&
        strikeRasterDiagnostics.glyphInkPixelCount > 0,
      `PDF.js raster diagnostics did not find both the strike and text ink: ${
        JSON.stringify(strikeRasterDiagnostics)
      }.`
    );
    console.info("[PrivyPDF text-mark diagnostics]", {
      phase: "serialized-pdfjs-raster",
      annotationId: formatted.model.page.annotations[1].id,
      segment: formatted.model.page.annotations[1].segments[0],
      calculatedNormalizedStrikeCenter: {
        x: formatted.model.page.annotations[1].segments[0].x +
          formatted.model.page.annotations[1].segments[0].w / 2,
        y: formatted.model.page.annotations[1].segments[0].y +
          formatted.model.page.annotations[1].segments[0].h * 0.52,
      },
      measurements: strikeRasterDiagnostics,
      limitation: "independent-glyphs.pdf fixture measurement, not the reported Deficit Recipes PDF.",
    });
  }
  const formattedGapGroups = occupiedColumnGroups(formatted.spacingCanvas);
  assert(
    formattedGapGroups >= 3,
    `The formatted glyphs have no visible inter-character gaps (${formattedGapGroups} ink groups).`
  );
  const unresized = await exportAndInspect(sourceBytes);
  const unresizedGlyphs = glyphShows(unresized.streams.join("\n"));
  assert(
    unresizedGlyphs.length === formattedGlyphs.length &&
      unresizedGlyphs.every((glyph, index) =>
        glyph.matrix.every(
          (value, matrixIndex) => Math.abs(value - formattedGlyphs[index].matrix[matrixIndex]) < 0.00001
        ) &&
        glyph.horizontalScalesBefore.length ===
          formattedGlyphs[index].horizontalScalesBefore.length &&
        glyph.horizontalScalesBefore.every(
          (value, scaleIndex) =>
            Math.abs(value - formattedGlyphs[index].horizontalScalesBefore[scaleIndex]) < 0.001
        )
      ),
    "Resizing the transform box changed exported glyph placement or spacing."
  );
  const unresizedGapGroups = occupiedColumnGroups(unresized.spacingCanvas);
  const unresizedPreview = await previewGlyphBounds(unresized.model);
  assert(
    unresizedGapGroups >= 3 &&
      unresizedGapGroups === formattedGapGroups &&
      unresizedPreview.glyphBounds.every((glyph, index) =>
        Math.abs(glyph.left - formattedPreview.glyphBounds[index].left) < 0.01 &&
        Math.abs(glyph.width - formattedPreview.glyphBounds[index].width) < 0.01
      ),
    `Resized and unresized exports have different visible spacing (${formattedGapGroups}, ${unresizedGapGroups}).`
  );
  const untouchedPreview = document.createElement("span");
  untouchedPreview.textContent = "ordinary continuous text";
  assert(
    !renderIndependentGlyphPreview(
      untouchedPreview,
      null,
      formatted.model.page.annotations[0],
      formatted.model.page,
      1
    ) && untouchedPreview.textContent === "ordinary continuous text",
    "The independent-glyph preview renderer changed ordinary continuous text."
  );
  checks.push({
    name: "Bold italic 25 pt after transform-box resize",
    bytes: formatted.outputBytes.length,
    positions: formattedGlyphs.map((item) => item.matrix.slice(4)),
    fonts: formattedGlyphs.map((item) => `${item.fontName} ${item.fontSize}`),
    compensatedTz: formattedGlyphs.map((item) => item.horizontalScalesBefore[0]),
    visibleInkGroups: formattedGapGroups,
    previewGlyphs: formattedPreview.glyphBounds,
    resizedBox: {
      x: formatted.model.page.annotations[0].x,
      y: formatted.model.page.annotations[0].y,
      w: formatted.model.page.annotations[0].w,
      h: formatted.model.page.annotations[0].h,
    },
    redMarkPixels,
    ...(strikeRasterDiagnostics ? { strikeRasterDiagnostics } : {}),
  });
  await formatted.task.destroy();
  await unresized.task.destroy();
  await sourcePageTask.destroy();

  const mixed = await exportAndInspect(sourceBytes, {
    ranges: [{
      start: 1,
      end: 2,
      style: { fontSize: 12, italic: true, color: "#00ff00" },
    }],
  });
  const mixedGlyphs = glyphShows(mixed.streams.join("\n"));
  assert(
    mixed.textItems.map((item) => item.str).join("").replace(/\s/g, "") === "ABC",
    `Mixed formatting changed extracted glyph order or content (${
      mixed.textItems.map((item) => item.str).join("")
    }; ${JSON.stringify(mixedGlyphs)}).`
  );
  for (let index = 0; index < sourceGlyphs.length; index++) {
    const sourceGlyph = sourceGlyphs[index];
    const outputGlyph = mixedGlyphs[index];
    assert(
      outputGlyph.character === sourceGlyph.character &&
        outputGlyph.matrix.every(
          (value, matrixIndex) => Math.abs(value - sourceGlyph.matrix[matrixIndex]) < 0.00001
        ),
      `Mixed formatting moved glyph ${sourceGlyph.character}.`
    );
  }
  assert(
    mixedGlyphs[0].fontName === "/F1" &&
      mixedGlyphs[1].fontName === "/PrivyRangeHelveticaOblique" &&
      mixedGlyphs[2].fontName === "/F1" &&
      mixedGlyphs[0].fontSize === 20 &&
      mixedGlyphs[1].fontSize === 12 &&
      mixedGlyphs[2].fontSize === 20,
    "Mixed formatting changed an unformatted glyph's font."
  );
  assert(
    /\/PrivyRangeHelveticaOblique 12 Tf 0 1 0 rg \(B\) Tj 0 g \/F1 20 Tf/.test(
      mixed.streams.join("\n")
    ),
    "The formatted glyph's source color or font state was not restored."
  );
  const mixedPreview = await previewGlyphBounds(mixed.model);
  assert(
    mixedPreview.glyphBounds.length === 3 &&
      mixedPreview.glyphBounds[0].fontSize === 20 &&
      mixedPreview.glyphBounds[0].fontWeight === "normal" &&
      mixedPreview.glyphBounds[1].fontSize === 12 &&
      mixedPreview.glyphBounds[1].fontStyle === "italic" &&
      mixedPreview.glyphBounds[2].fontSize === 20 &&
      mixedPreview.glyphBounds.every((glyph, index) =>
        Math.abs(glyph.left - sourceGlyphs[index].matrix[4]) < 0.01
      ),
    "Mixed formatted and unformatted preview glyphs lost their styles or source origins."
  );
  assert(
    mixedGlyphs[1].horizontalScalesBefore.length === 0 &&
      mixedGlyphs[1].horizontalScalesAfter.length === 0,
    "A narrower formatted glyph was unnecessarily compressed."
  );
  assertOperatorsValid(mixed.streams.join("\n"));
  checks.push({
    name: "Mixed formatted and unformatted glyphs",
    bytes: mixed.outputBytes.length,
    fonts: mixedGlyphs.map((item) => `${item.fontName} ${item.fontSize}`),
  });
  await mixed.task.destroy();

  const multiCharacterShow = await fixtureBytes((content) =>
    content
      .replace(" (A) Tj ET Q", " (AB) Tj ET Q")
      .replace(/q 0 0 300 200 re W n BT \/F1 20 Tf 1\.18 0 0 1 61\.34000 110 Tm 0 g 0 G \(B\) Tj ET Q/, "")
  );
  await assertRejected(multiCharacterShow, "Multi-character source show");

  const ambiguous = await fixtureBytes((content) => `${content}\n${content}`);
  await assertRejected(ambiguous, "Ambiguous independent glyph mapping");

  const incompatibleState = await fixtureBytes((content) =>
    content.replace(
      "1.18 0 0 1 61.34000 110 Tm",
      "1.18 0 0 1 61.34000 111 Tm"
    )
  );
  await assertRejected(incompatibleState, "Incompatible glyph baseline");

  const missingMetrics = await fixtureBytes((content) => content);
  const missingDocument = await PDFDocument.load(missingMetrics.slice());
  const missingPage = missingDocument.getPage(0);
  const resourceDictionary = missingDocument.context.lookup(missingPage.node.Resources());
  const fontDictionary = missingDocument.context.lookup(resourceDictionary.get(PDFName.Font));
  const sourceFont = missingDocument.context.lookup(fontDictionary.get(PDFName.of("F1")));
  sourceFont.set(PDFName.of("BaseFont"), PDFName.of("UnverifiedCustomFont"));
  sourceFont.delete(PDFName.of("FirstChar"));
  sourceFont.delete(PDFName.of("Widths"));
  await assertRejected(
    new Uint8Array(await missingDocument.save()),
    "Missing source glyph metrics"
  );
  await assertRejected(
    sourceBytes,
    "Movement with independently positioned character formatting",
    { move: true }
  );
  await assertRejected(
    sourceBytes,
    "Missing immutable source geometry",
    { omitSourceMatchGeometry: true }
  );

  results.className = "pass";
  results.textContent = `PASS\n${JSON.stringify(checks, null, 2)}`;
} catch (error) {
  results.className = "fail";
  results.textContent = `FAIL\n${error.stack || error}`;
  throw error;
}

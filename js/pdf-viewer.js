import * as pdfjs from "/vendor/pdfjs/pdf.min.js";
import { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb, decodePDFRawStream } from "/vendor/pdf-lib/pdf-lib.esm.min.js";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";

export const A4 = { width: 595.28, height: 841.89 };

export class PasswordProtectedError extends Error {}

export async function openPdf(bytes) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
    cMapUrl: "/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    wasmUrl: "/vendor/pdfjs/wasm/",
  });
  try {
    return await task.promise;
  } catch (err) {
    if (err?.name === "PasswordException") throw new PasswordProtectedError("Password protected");
    throw err;
  }

}

export async function loadImage(bytes, type) {
  const blob = new Blob([bytes], { type });
  const bitmap = await createImageBitmap(blob);
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

/** Image pages are sized to their pixels at 72 dpi, capped to A4's long side. */
export function imagePageSize(px, py) {
  const w = px * 0.75;
  const h = py * 0.75;
  const s = Math.min(1, A4.height / Math.max(w, h));
  return { width: w * s, height: h * s };
}

export function rotatedSize(page) {
  const turned = page.rotation % 180 !== 0;
  return turned ? { width: page.height, height: page.width } : { width: page.width, height: page.height };
}

/**
 * Draws a page model onto a canvas at the given scale (CSS px per PDF point).
 * Returns the render task's promise so callers can cancel on teardown.
 */
export async function renderToCanvas(page, source, canvas, scale) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = rotatedSize(page);
  canvas.width = Math.max(1, Math.floor(width * scale * dpr));
  canvas.height = Math.max(1, Math.floor(height * scale * dpr));
  canvas.style.aspectRatio = `${width} / ${height}`;
  const ctx = canvas.getContext("2d");

  if (page.kind === "pdf") {
    const pdfPage = await getPdfPage(source, page.index);
    const viewport = pdfPage.getViewport({
      scale: scale * dpr,
      rotation: (pdfPage.rotate + page.rotation) % 360,
    });
    await pdfPage.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
    return;
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (page.kind === "image") {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((page.rotation * Math.PI) / 180);
    const w = page.width * scale * dpr;
    const h = page.height * scale * dpr;
    ctx.drawImage(source.bitmap, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

async function getPdfPage(source, index) {
  source.pageCache ??= new Map();
  if (!source.pageCache.has(index)) source.pageCache.set(index, source.pdf.getPage(index + 1));
  return source.pageCache.get(index);
}

export async function readPdfPageSizes(pdf) {
  const sizes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    sizes.push({ width: vp.width, height: vp.height });
  }
  return sizes;
}

function pointToPdf(point, rotation, width, height) {
  switch (rotation % 360) {
    case 90:
      return { x: point.y * width, y: point.x * height };
    case 180:
      return { x: width - point.x * width, y: point.y * height };
    case 270:
      return { x: width - point.y * width, y: height - point.x * height };
    default:
      return { x: point.x * width, y: height - point.y * height };
  }
}

function boxToPdf(annotation, rotation, width, height) {
  const points = [
    pointToPdf({ x: annotation.x, y: annotation.y }, rotation, width, height),
    pointToPdf({ x: annotation.x + annotation.w, y: annotation.y }, rotation, width, height),
    pointToPdf({ x: annotation.x, y: annotation.y + annotation.h }, rotation, width, height),
    pointToPdf({ x: annotation.x + annotation.w, y: annotation.y + annotation.h }, rotation, width, height),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function parseColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value || "");
  if (!match) return rgb(0.09, 0.09, 0.09);
  const number = Number.parseInt(match[1], 16);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

function isPdfWhitespace(byte) {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
}

function skipContentWhitespace(bytes, offset) {
  while (offset < bytes.length) {
    if (isPdfWhitespace(bytes[offset])) {
      offset++;
    } else if (bytes[offset] === 37) {
      while (offset < bytes.length && bytes[offset] !== 10 && bytes[offset] !== 13) offset++;
    } else {
      break;
    }
  }
  return offset;
}

function parseContentToken(bytes, start) {
  let offset = start;
  const first = bytes[offset];
  if (first === 40) {
    const value = [];
    let depth = 1;
    offset++;
    while (offset < bytes.length && depth > 0) {
      const byte = bytes[offset++];
      if (byte === 92) {
        if (offset >= bytes.length) break;
        const escaped = bytes[offset++];
        if (escaped >= 48 && escaped <= 55) {
          let octal = String.fromCharCode(escaped);
          for (let count = 1; count < 3 && offset < bytes.length && bytes[offset] >= 48 && bytes[offset] <= 55; count++) {
            octal += String.fromCharCode(bytes[offset++]);
          }
          value.push(Number.parseInt(octal, 8));
        } else if (escaped === 110) value.push(10);
        else if (escaped === 114) value.push(13);
        else if (escaped === 116) value.push(9);
        else if (escaped === 98) value.push(8);
        else if (escaped === 102) value.push(12);
        else if (escaped === 10) continue;
        else if (escaped === 13) {
          if (bytes[offset] === 10) offset++;
        } else value.push(escaped);
      } else if (byte === 40) {
        depth++;
        value.push(byte);
      } else if (byte === 41) {
        depth--;
        if (depth > 0) value.push(byte);
      } else {
        value.push(byte);
      }
    }
    return depth === 0 ? { type: "string", start, end: offset, bytes: value } : null;
  }
  if (first === 60 && bytes[offset + 1] !== 60) {
    offset++;
    let hex = "";
    while (offset < bytes.length && bytes[offset] !== 62) {
      if (!isPdfWhitespace(bytes[offset])) hex += String.fromCharCode(bytes[offset]);
      offset++;
    }
    if (bytes[offset] !== 62 || !/^[0-9a-f]*$/i.test(hex)) return null;
    if (hex.length % 2) hex += "0";
    const value = [];
    for (let index = 0; index < hex.length; index += 2) {
      value.push(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    return { type: "string", start, end: offset + 1, bytes: value };
  }
  if (first === 91) {
    const items = [];
    offset++;
    while (offset < bytes.length) {
      offset = skipContentWhitespace(bytes, offset);
      if (bytes[offset] === 93) return { type: "array", start, end: offset + 1, items };
      const item = parseContentToken(bytes, offset);
      if (!item) return null;
      items.push(item);
      offset = item.end;
    }
    return null;
  }
  if (first === 47) {
    offset++;
    while (
      offset < bytes.length &&
      !isPdfWhitespace(bytes[offset]) &&
      ![40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(bytes[offset])
    ) {
      offset++;
    }
    return { type: "name", start, end: offset };
  }
  if (first === 60 || first === 62 || first === 123 || first === 125) {
    return { type: "other", start, end: Math.min(bytes.length, offset + 2) };
  }
  while (
    offset < bytes.length &&
    !isPdfWhitespace(bytes[offset]) &&
    ![40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(bytes[offset])
  ) {
    offset++;
  }
  if (offset === start) offset++;
  return { type: "word", start, end: offset };
}

function parseContentTokens(bytes) {
  const tokens = [];
  let offset = 0;
  while (offset < bytes.length) {
    offset = skipContentWhitespace(bytes, offset);
    if (offset >= bytes.length) break;
    const token = parseContentToken(bytes, offset);
    if (!token) throw new Error("The selected PDF page has an unsupported text content stream.");
    tokens.push(token);
    offset = token.end;
  }
  return tokens;
}

function asciiText(token) {
  if (token.bytes.some((byte) => byte < 32 || byte > 126)) return null;
  let text = "";
  for (const byte of token.bytes) text += String.fromCharCode(byte);
  return text;
}

function decodeUtf16Hex(hex) {
  const normalized = hex.replace(/\s/g, "");
  if (!/^(?:[0-9a-f]{4})+$/i.test(normalized)) return null;
  const units = [];
  for (let offset = 0; offset < normalized.length; offset += 4) {
    units.push(Number.parseInt(normalized.slice(offset, offset + 4), 16));
  }
  if (units[0] === 0xfeff) units.shift();
  let text = "";
  for (let offset = 0; offset < units.length; offset += 4096) {
    text += String.fromCharCode(...units.slice(offset, offset + 4096));
  }
  return text;
}

function incrementHex(hex) {
  const next = BigInt(`0x${hex}`) + 1n;
  return next.toString(16).padStart(hex.length, "0");
}

function parseToUnicodeCMap(bytes) {
  let source = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    source += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  source = source.replace(/%[^\r\n]*/g, "");
  const tokens = [];
  const pattern = /<([0-9a-f\s]*)>|\[|\]|\/[^\s]+|-?\d+|[A-Za-z]+/gi;
  for (const match of source.matchAll(pattern)) {
    tokens.push(match[1] === undefined ? match[0] : { hex: match[1].replace(/\s/g, "") });
  }

  const mappings = new Map();
  const add = (code, unicode) => {
    const normalizedCode = code.replace(/\s/g, "").toUpperCase();
    if (/^(?:[0-9A-F]{2}|[0-9A-F]{4})$/.test(normalizedCode) && unicode !== null) {
      mappings.set(normalizedCode, unicode);
    }
  };

  for (let index = 0; index < tokens.length; index++) {
    const section = tokens[index];
    if (section !== "beginbfchar" && section !== "beginbfrange") continue;
    const count = Number(tokens[index - 1]);
    if (!Number.isInteger(count) || count < 0 || count > 65536) continue;
    let cursor = index + 1;
    for (let entry = 0; entry < count && cursor < tokens.length; entry++) {
      if (section === "beginbfchar") {
        const code = tokens[cursor++];
        const destination = tokens[cursor++];
        if (code?.hex && destination?.hex) add(code.hex, decodeUtf16Hex(destination.hex));
        continue;
      }

      const start = tokens[cursor++];
      const end = tokens[cursor++];
      const destination = tokens[cursor++];
      if (!start?.hex || !end?.hex || !destination) continue;
      const firstCode = Number.parseInt(start.hex, 16);
      const lastCode = Number.parseInt(end.hex, 16);
      const rangeSize = lastCode - firstCode + 1;
      if (
        !Number.isSafeInteger(firstCode) ||
        !Number.isSafeInteger(lastCode) ||
        rangeSize < 1 ||
        rangeSize > 65536
      ) {
        continue;
      }

      if (destination === "[") {
        const destinations = [];
        while (cursor < tokens.length && tokens[cursor] !== "]") destinations.push(tokens[cursor++]);
        if (tokens[cursor] === "]") cursor++;
        for (let offset = 0; offset < Math.min(rangeSize, destinations.length); offset++) {
          const value = destinations[offset];
          if (value?.hex) {
            add((firstCode + offset).toString(16).padStart(start.hex.length, "0"), decodeUtf16Hex(value.hex));
          }
        }
      } else if (destination.hex) {
        let unicodeHex = destination.hex;
        for (let offset = 0; offset < rangeSize; offset++) {
          add((firstCode + offset).toString(16).padStart(start.hex.length, "0"), decodeUtf16Hex(unicodeHex));
          unicodeHex = incrementHex(unicodeHex);
        }
      }
    }
    index = cursor;
  }
  return mappings;
}

function compositeFontInfo(document, font, fontName) {
  const encoding = font.get(PDFName.of("Encoding"))?.toString();
  if (encoding !== "/Identity-H") {
    return { error: "Only horizontal Identity-H composite fonts can be edited safely." };
  }

  const toUnicodeEntry = font.get(PDFName.of("ToUnicode"));
  const toUnicodeStream = toUnicodeEntry && document.context.lookup(toUnicodeEntry);
  if (!toUnicodeStream) {
    return { error: "This composite font does not include a ToUnicode character map." };
  }
  const mappings = parseToUnicodeCMap(decodePDFRawStream(toUnicodeStream).decode());
  if (!mappings.size) {
    return { error: "This composite font has no usable ToUnicode character mappings." };
  }

  const descendantEntry = font.get(PDFName.of("DescendantFonts"));
  const descendants = descendantEntry && document.context.lookup(descendantEntry);
  const descendant = descendants?.asArray?.()[0] && document.context.lookup(descendants.asArray()[0]);
  const widthsEntry = descendant?.get(PDFName.of("W"));
  const widthsArray = widthsEntry && document.context.lookup(widthsEntry);
  const widths = new Map();
  const widthTokens = widthsArray?.asArray?.() || [];
  for (let index = 0; index < widthTokens.length;) {
    const firstCid = document.context.lookup(widthTokens[index++])?.asNumber?.();
    const next = document.context.lookup(widthTokens[index++]);
    if (!Number.isInteger(firstCid) || !next) break;
    const values = next.asArray?.();
    if (values) {
      let cid = firstCid;
      for (const width of values) {
        widths.set(cid++, document.context.lookup(width)?.asNumber?.());
      }
    } else {
      const lastCid = next.asNumber?.();
      const width = document.context.lookup(widthTokens[index++])?.asNumber?.();
      if (!Number.isInteger(lastCid) || !Number.isFinite(width) || lastCid < firstCid || lastCid - firstCid > 65535) {
        break;
      }
      for (let cid = firstCid; cid <= lastCid; cid++) widths.set(cid, width);
    }
  }

  const defaultWidth = descendant?.get(PDFName.of("DW"))?.asNumber?.() ?? 1000;
  const reverseMappings = new Map();
  for (const [code, unicode] of mappings) {
    if ([...code].length !== 4) continue;
    reverseMappings.set(unicode, reverseMappings.has(unicode) ? null : code);
  }
  return { fontName, kind: "composite", mappings, reverseMappings, widths, defaultWidth };
}

function simpleUnicodeFontInfo(document, font, fontName) {
  const toUnicodeEntry = font.get(PDFName.of("ToUnicode"));
  const toUnicodeStream = toUnicodeEntry && document.context.lookup(toUnicodeEntry);
  if (!toUnicodeStream) return null;
  const mappings = parseToUnicodeCMap(decodePDFRawStream(toUnicodeStream).decode());
  if (![...mappings.keys()].some((code) => code.length === 2)) return null;
  const reverseMappings = new Map();
  for (const [code, unicode] of mappings) {
    if (code.length !== 2) continue;
    reverseMappings.set(unicode, reverseMappings.has(unicode) ? null : code);
  }
  return { fontName, kind: "simple", mappings, reverseMappings };
}

function decodeMappedText(token, info, bytesPerCode) {
  if (token.bytes.length % bytesPerCode) return null;
  let text = "";
  for (let offset = 0; offset < token.bytes.length; offset += bytesPerCode) {
    let code = "";
    for (let byte = 0; byte < bytesPerCode; byte++) {
      code += token.bytes[offset + byte].toString(16).padStart(2, "0");
    }
    code = code.toUpperCase();
    const character = info.mappings.get(code);
    if (character === undefined) return null;
    text += character;
  }
  return text;
}

function encodeMappedText(text, info, bytesPerCode) {
  const bytes = [];
  for (const character of text) {
    const code = info.reverseMappings.get(character);
    if (!code) {
      throw new Error(
        `The source font has no unambiguous glyph mapping for "${character}". The PDF was not changed.`
      );
    }
    for (let offset = 0; offset < bytesPerCode * 2; offset += 2) {
      bytes.push(Number.parseInt(code.slice(offset, offset + 2), 16));
    }
  }
  if (bytesPerCode !== 1) {
    return new TextEncoder().encode(`<${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}>`);
  }
  const literal = [40];
  for (const byte of bytes) {
    if (byte === 40 || byte === 41 || byte === 92) {
      literal.push(92, byte);
    } else if (byte < 32 || byte > 126) {
      literal.push(92, 48 + ((byte >> 6) & 7), 48 + ((byte >> 3) & 7), 48 + (byte & 7));
    } else {
      literal.push(byte);
    }
  }
  literal.push(41);
  return literal;
}

function encodePdfLiteral(text) {
  if (!/^[\x20-\x7e]*$/.test(text)) {
    throw new Error("In-place text editing currently supports basic printable ASCII characters only.");
  }
  const bytes = [40];
  for (const character of text) {
    const byte = character.charCodeAt(0);
    if (byte === 40 || byte === 41 || byte === 92) bytes.push(92);
    bytes.push(byte);
  }
  bytes.push(41);
  return bytes;
}

function asciiBytes(bytes, start, end) {
  let text = "";
  for (let offset = start; offset < end; offset++) text += String.fromCharCode(bytes[offset]);
  return text;
}

function tokenNumber(token, bytes) {
  if (token?.type !== "word") return null;
  const value = Number(asciiBytes(bytes, token.start, token.end));
  return Number.isFinite(value) ? value : null;
}

const STANDARD_FONT_NAMES = {
  "/Courier": "Courier",
  "/Courier-Bold": "CourierBold",
  "/Courier-Oblique": "CourierOblique",
  "/Courier-BoldOblique": "CourierBoldOblique",
  "/Helvetica": "Helvetica",
  "/Helvetica-Bold": "HelveticaBold",
  "/Helvetica-Oblique": "HelveticaOblique",
  "/Helvetica-BoldOblique": "HelveticaBoldOblique",
  "/Times-Roman": "TimesRoman",
  "/Times-Bold": "TimesRomanBold",
  "/Times-Italic": "TimesRomanItalic",
  "/Times-BoldItalic": "TimesRomanBoldItalic",
};

async function applyTextEdits(document, page, model, baseRotation = 0) {
  const edits = (model.annotations || []).filter((annotation) => annotation.type === "text-edit");
  if (!edits.length) return;

  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((stream) => document.context.lookup(stream))
    : [document.context.lookup(contents)];
  const chunks = streams.map((stream) => decodePDFRawStream(stream).decode());
  const contentSize = chunks.reduce((size, chunk) => size + chunk.length, Math.max(0, chunks.length - 1));
  const bytes = new Uint8Array(contentSize);
  let contentOffset = 0;
  chunks.forEach((chunk, index) => {
    if (index) bytes[contentOffset++] = 10;
    bytes.set(chunk, contentOffset);
    contentOffset += chunk.length;
  });
  const resources = document.context.lookup(page.node.Resources());
  const fontEntries = resources?.get(PDFName.Font);
  const fonts = fontEntries && document.context.lookup(fontEntries);
  const fontCache = new Map();
  const fontInfoFor = (fontName) => {
    if (!fontName) return null;
    if (fontCache.has(fontName)) return fontCache.get(fontName);
    const reference = fonts?.get(PDFName.of(fontName.slice(1)));
    const font = reference && document.context.lookup(reference);
    if (!font?.get) {
      fontCache.set(fontName, null);
      return null;
    }
    const subtype = font.get(PDFName.of("Subtype"))?.toString();
    const info =
      subtype === "/Type0"
        ? compositeFontInfo(document, font, fontName)
        : (subtype === "/Type1" || subtype === "/TrueType") &&
            !font.get(PDFName.of("Encoding"))
          ? simpleUnicodeFontInfo(document, font, fontName)
          : null;
    fontCache.set(fontName, info);
    return info;
  };
  const decodeText = (token) => {
    const fontInfo = fontInfoFor(token.fontName);
    if (!fontInfo) return asciiText(token);
    if (fontInfo.error) return null;
    return decodeMappedText(token, fontInfo, fontInfo.kind === "composite" ? 2 : 1);
  };
  const tokens = parseContentTokens(bytes);
  const showStrings = [];
  let activeFontName = null;
  let activeFontSize = null;
  let horizontalScale = 100;
  let characterSpacing = 0;
  let wordSpacing = 0;
  const graphicsStateStack = [];
  for (let index = 0; index < tokens.length - 1; index++) {
    const operand = tokens[index];
    const operator = tokens[index + 1];
    if (operator.type !== "word") continue;
    const operatorName = asciiBytes(bytes, operator.start, operator.end);
    if (operatorName === "Tf") {
      const font = tokens[index - 1];
      activeFontName = font?.type === "name" ? asciiBytes(bytes, font.start, font.end) : null;
      activeFontSize = tokenNumber(operand, bytes);
    } else if (operatorName === "Tz") {
      horizontalScale = tokenNumber(operand, bytes) ?? horizontalScale;
    } else if (operatorName === "Tc") {
      characterSpacing = tokenNumber(operand, bytes) ?? characterSpacing;
    } else if (operatorName === "Tw") {
      wordSpacing = tokenNumber(operand, bytes) ?? wordSpacing;
    } else if (operatorName === "q") {
      graphicsStateStack.push({ activeFontName, activeFontSize, horizontalScale, characterSpacing, wordSpacing });
    } else if (operatorName === "Q") {
      const previous = graphicsStateStack.pop();
      if (previous) {
        activeFontName = previous.activeFontName;
        activeFontSize = previous.activeFontSize;
        horizontalScale = previous.horizontalScale;
        characterSpacing = previous.characterSpacing;
        wordSpacing = previous.wordSpacing;
      }
    }
    if (operatorName === "Tj" && operand.type === "string") {
      showStrings.push({
        ...operand,
        containerStart: operand.start,
        operationEnd: operator.end,
        fontName: activeFontName,
        fontSize: activeFontSize,
        horizontalScale,
        characterSpacing,
        wordSpacing,
      });
    } else if (
      operatorName === "TJ" &&
      operand.type === "array" &&
      operand.items.every((item) =>
        item.type === "string" ||
        item.type === "word" && Number.isFinite(Number(asciiBytes(bytes, item.start, item.end)))
      ) &&
      operand.items.some((item) => item.type === "string")
    ) {
      const sourceBytes = operand.items
        .filter((item) => item.type === "string")
        .flatMap((item) => item.bytes);
      showStrings.push({
        ...operand.items.find((item) => item.type === "string"),
        bytes: sourceBytes,
        containerStart: operand.start,
        operationEnd: operator.end,
        fontName: activeFontName,
        fontSize: activeFontSize,
        horizontalScale,
        characterSpacing,
        wordSpacing,
        tjAdjustment: operand.items.reduce(
          (sum, item) =>
            item.type === "word"
              ? sum + (tokenNumber(item, bytes) ?? 0)
              : sum,
          0
        ),
      });
    }
  }
  const textRuns = [];
  for (let start = 0; start < showStrings.length; start++) {
    let text = "";
    const sourceCodes = [];
    let tjAdjustment = 0;
    let previous = null;
    for (let index = start; index < showStrings.length; index++) {
      const part = showStrings[index];
      if (
        previous &&
        (skipContentWhitespace(bytes, previous.operationEnd) !== part.containerStart ||
          part.fontName !== previous.fontName ||
          part.fontSize !== previous.fontSize ||
          part.horizontalScale !== previous.horizontalScale ||
          part.characterSpacing !== previous.characterSpacing ||
          part.wordSpacing !== previous.wordSpacing)
      ) {
        break;
      }
      const value = decodeText(part);
      if (value === null) break;
      text += value;
      sourceCodes.push(...part.bytes);
      tjAdjustment += part.tjAdjustment || 0;
      textRuns.push({
        ...showStrings[start],
        end: part.operationEnd,
        text,
        sourceCodes: sourceCodes.slice(),
        tjAdjustment,
      });
      previous = part;
    }
  }

  const replacements = new Map();
  for (const edit of edits) {
    const matching = textRuns.filter((token) => token.text === edit.originalText);
    const target = matching[edit.occurrenceIndex || 0];
    if (!target) {
      const unsupportedFont = [...fontCache.values()].find((info) => info?.error);
      if (unsupportedFont) {
        throw new Error(`${unsupportedFont.error} The PDF was not changed.`);
      }
      throw new Error(
        `Couldn't safely locate "${edit.originalText}" as a single editable PDF text run. The page was not changed.`
      );
    }
    if (!target.fontName) {
      throw new Error("Couldn't identify the source font for this text. The page was not changed.");
    }
    const fontReference = fonts?.get(PDFName.of(target.fontName.slice(1)));
    if (!fontReference) {
      throw new Error(`Couldn't find source font ${target.fontName} for in-place text editing.`);
    }
    const font = document.context.lookup(fontReference);
    if (!font?.get) throw new Error(`Couldn't read source font ${target.fontName} for in-place text editing.`);
    const subtype = font.get(PDFName.of("Subtype"))?.toString();
    const encodingValue = font.get(PDFName.of("Encoding"));
    const encoding = encodingValue?.toString();
    const baseFont = font.get(PDFName.of("BaseFont"))?.toString();
    const isComposite = subtype === "/Type0";
    const compositeInfo = isComposite ? fontInfoFor(target.fontName) : null;
    const simpleUnicodeInfo = !isComposite ? fontInfoFor(target.fontName) : null;
    if (isComposite && (!compositeInfo || compositeInfo.error)) {
      throw new Error(
        compositeInfo?.error || "This composite font cannot be edited safely. The PDF was not changed."
      );
    }
    const descriptorEntry = font.get(PDFName.of("FontDescriptor"));
    const descendants = isComposite && font.get(PDFName.of("DescendantFonts"));
    const descendant = descendants && document.context.lookup(descendants)?.asArray?.()[0];
    const descendantFont = descendant && document.context.lookup(descendant);
    const effectiveDescriptorEntry = isComposite
      ? descendantFont?.get(PDFName.of("FontDescriptor"))
      : descriptorEntry;
    const descriptor = effectiveDescriptorEntry && document.context.lookup(effectiveDescriptorEntry);
    const embedded =
      descriptor?.has(PDFName.of("FontFile")) ||
      descriptor?.has(PDFName.of("FontFile2")) ||
      descriptor?.has(PDFName.of("FontFile3"));
    if (
      !isComposite &&
      ((subtype !== "/Type1" && subtype !== "/TrueType") ||
        (!["/WinAnsiEncoding", "/MacRomanEncoding", "/StandardEncoding"].includes(encoding) &&
          !(encodingValue === undefined && simpleUnicodeInfo?.kind === "simple")))
    ) {
      throw new Error("This text uses a composite font or an encoding not supported for in-place editing.");
    }
    if (!isComposite && !(encodingValue instanceof PDFName)) {
      if (!(encodingValue === undefined && simpleUnicodeInfo?.kind === "simple")) {
        throw new Error("This text uses a custom font encoding. In-place editing for this font isn't supported.");
      }
    }
    const widthsValue = isComposite ? null : font.get(PDFName.of("Widths"));
    const widths = widthsValue && document.context.lookup(widthsValue);
    const firstChar = font.get(PDFName.of("FirstChar"))?.asNumber();
    if (!isComposite && embedded && (!widths?.asArray || !Number.isFinite(firstChar))) {
      throw new Error("This embedded font has no simple character-width table. The PDF was not changed.");
    }
    if (
      !target.fontSize ||
      (!isComposite && embedded && !widths) ||
      (!isComposite &&
        !embedded &&
        !STANDARD_FONT_NAMES[baseFont] &&
        simpleUnicodeInfo?.kind !== "simple")
    ) {
      throw new Error("Couldn't measure this source font's text width safely. The PDF was not changed.");
    }
    const standardFont =
      !embedded && STANDARD_FONT_NAMES[baseFont]
        ? await document.embedFont(StandardFonts[STANDARD_FONT_NAMES[baseFont]])
        : null;
    const widthTable = widths?.asArray().map((width) => width.asNumber());
    const textWidth = (value) => {
      if (isComposite) {
        return [...value].reduce((sum, character) => {
          const code = compositeInfo.reverseMappings.get(character);
          if (!code) {
            throw new Error(
              `The source font has no unambiguous glyph mapping for "${character}". The PDF was not changed.`
            );
          }
          const cid = Number.parseInt(code, 16);
          const width = compositeInfo.widths.get(cid) ?? compositeInfo.defaultWidth;
          return sum + (width / 1000) * target.fontSize;
        }, 0) +
          [...value].length * target.characterSpacing;
      }
      const glyphWidth = standardFont
        ? standardFont.widthOfTextAtSize(value, target.fontSize)
        : [...value].reduce((sum, character) => {
            const code = character.charCodeAt(0);
            const width = widthTable[code - firstChar];
            if (!Number.isFinite(width)) {
              throw new Error("The embedded source font is missing character widths needed to preserve page layout.");
            }
            return sum + (width / 1000) * target.fontSize;
          }, 0);
      return (
        glyphWidth +
        value.length * target.characterSpacing +
        (value.match(/ /g)?.length || 0) * target.wordSpacing
      );
    };
    const originalWidth = isComposite
      ? target.sourceCodes.reduce((sum, byte, index, codes) => {
          if (index % 2 !== 0) return sum;
          const cid = byte * 256 + codes[index + 1];
          const width = compositeInfo.widths.get(cid) ?? compositeInfo.defaultWidth;
          return sum + (width / 1000) * target.fontSize;
        }, 0) +
        (target.sourceCodes.length / 2) * target.characterSpacing -
        (target.tjAdjustment || 0) * target.fontSize / 1000
      : textWidth(edit.originalText) - (target.tjAdjustment || 0) * target.fontSize / 1000;
    const replacementWidth = textWidth(edit.text);
    const scale = replacementWidth > originalWidth
      ? target.horizontalScale * originalWidth / replacementWidth
      : target.horizontalScale;
    const leftoverWidth = Math.max(0, originalWidth - replacementWidth);
    const adjustment = leftoverWidth
      ? -((leftoverWidth * 1000) / (target.fontSize * (target.horizontalScale / 100)))
      : null;
    const replacementBytes = isComposite
      ? encodeMappedText(edit.text, compositeInfo, 2)
      : simpleUnicodeInfo?.kind === "simple"
        ? encodeMappedText(edit.text, simpleUnicodeInfo, 1)
        : encodePdfLiteral(edit.text);
    const scalePrefix = scale !== target.horizontalScale ? `${scale} Tz ` : "";
    const scaleSuffix = scalePrefix ? ` ${target.horizontalScale} Tz` : "";
    let moveX = 0;
    let moveY = 0;
    if (edit.moveX || edit.moveY) {
      const width = page.getWidth();
      const height = page.getHeight();
      switch (baseRotation % 360) {
        case 90:
          moveX = edit.moveY * width;
          moveY = edit.moveX * height;
          break;
        case 180:
          moveX = -edit.moveX * width;
          moveY = edit.moveY * height;
          break;
        case 270:
          moveX = -edit.moveY * width;
          moveY = -edit.moveX * height;
          break;
        default:
          moveX = edit.moveX * width;
          moveY = -edit.moveY * height;
      }
    }
    const movePrefix = moveX || moveY
      ? `1 0 0 1 ${moveX.toFixed(4)} ${moveY.toFixed(4)} cm `
      : "";
    const moveSuffix = moveX || moveY
      ? ` 1 0 0 1 ${(-moveX).toFixed(4)} ${(-moveY).toFixed(4)} cm`
      : "";
    const prefixBytes = new TextEncoder().encode(`${movePrefix}${scalePrefix}[`);
    const suffixBytes = new TextEncoder().encode(
      `${adjustment === null ? "" : ` ${adjustment.toFixed(4)}`} ] TJ${scaleSuffix}${moveSuffix}`
    );
    const operationBytes = new Uint8Array(prefixBytes.length + replacementBytes.length + suffixBytes.length);
    operationBytes.set(prefixBytes);
    operationBytes.set(replacementBytes, prefixBytes.length);
    operationBytes.set(suffixBytes, prefixBytes.length + replacementBytes.length);
    replacements.set(`${target.containerStart}:${target.operationEnd}`, {
      start: target.containerStart,
      end: target.end,
      bytes: operationBytes,
    });
  }

  const ordered = [...replacements.values()].sort((left, right) => left.start - right.start);
  const outputSize = bytes.length + ordered.reduce((size, replacement) => size + replacement.bytes.length - (replacement.end - replacement.start), 0);
  const output = new Uint8Array(outputSize);
  let sourceOffset = 0;
  let outputOffset = 0;
  for (const replacement of ordered) {
    const before = bytes.subarray(sourceOffset, replacement.start);
    output.set(before, outputOffset);
    outputOffset += before.length;
    output.set(replacement.bytes, outputOffset);
    outputOffset += replacement.bytes.length;
    sourceOffset = replacement.end;
  }
  output.set(bytes.subarray(sourceOffset), outputOffset);
  page.node.set(PDFName.Contents, document.context.register(document.context.flateStream(output)));
}

function pdfShapeDashArray(style, width) {
  const patterns = {
    dashed: [width * 7, width * 4],
    dotted: [width, width * 3],
    "dash-dot": [width * 7, width * 3, width, width * 3],
    "long-dash": [width * 12, width * 4],
    wavy: [width * 1.5, width * 2],
  };
  return patterns[style] || [];
}

function drawShapeSegments(page, points, annotation, { close = false } = {}) {
  const color = parseColor(annotation.color || "#171717");
  const width = Math.max(1, annotation.width || 1);
  const dashArray = pdfShapeDashArray(annotation.strokeStyle, width);
  const count = close ? points.length : points.length - 1;
  for (let index = 0; index < count; index++) {
    page.drawLine({
      start: points[index],
      end: points[(index + 1) % points.length],
      thickness: width,
      color,
      opacity: annotation.opacity ?? 1,
      ...(dashArray.length ? { dashArray } : {}),
    });
  }
}

function drawShapeMarker(page, endpoint, neighbor, kind, annotation) {
  if (!kind || kind === "none") return;
  const color = parseColor(annotation.color || "#171717");
  const opacity = annotation.opacity ?? 1;
  const width = Math.max(1, annotation.width || 1);
  const dx = endpoint.x - neighbor.x;
  const dy = endpoint.y - neighbor.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const size = Math.max(5, width * 4);
  if (kind === "circle") {
    page.drawEllipse({
      x: endpoint.x,
      y: endpoint.y,
      xScale: size / 2,
      yScale: size / 2,
      borderColor: color,
      borderWidth: width,
      borderOpacity: opacity,
    });
    return;
  }
  if (kind === "square") {
    page.drawRectangle({
      x: endpoint.x - size / 2,
      y: endpoint.y - size / 2,
      width: size,
      height: size,
      borderColor: color,
      borderWidth: width,
      borderOpacity: opacity,
    });
    return;
  }
  const baseX = endpoint.x - ux * size;
  const baseY = endpoint.y - uy * size;
  const offsetX = -uy * size * 0.45;
  const offsetY = ux * size * 0.45;
  const left = { x: baseX + offsetX, y: baseY + offsetY };
  const right = { x: baseX - offsetX, y: baseY - offsetY };
  const line = (start, end) => page.drawLine({ start, end, thickness: width, color, opacity });
  line(endpoint, left);
  line(endpoint, right);
  if (kind === "triangle") line(left, right);
}

async function drawAnnotations(document, page, model, baseRotation = 0) {
  if (!model.annotations?.length) return;
  const width = page.getWidth();
  const height = page.getHeight();
  const fonts = new Map();
  const images = new Map();

  for (const annotation of model.annotations) {
    if (annotation.type === "text-edit") continue;
    if (annotation.type === "formField") continue;
    const color = parseColor(annotation.color);
    if (annotation.type === "draw") {
      for (let index = 1; index < annotation.points.length; index++) {
        const start = pointToPdf(annotation.points[index - 1], baseRotation, width, height);
        const end = pointToPdf(annotation.points[index], baseRotation, width, height);
        page.drawLine({
          start,
          end,
          thickness: annotation.width || 2,
          color,
          opacity: annotation.opacity ?? 1,
        });
      }
      continue;
    }

    if (annotation.type === "shape" && annotation.shape === "line") {
      const points = [
        pointToPdf({ x: annotation.x, y: annotation.y }, baseRotation, width, height),
        pointToPdf({ x: annotation.x + annotation.w, y: annotation.y + annotation.h }, baseRotation, width, height),
      ];
      drawShapeSegments(page, points, annotation);
      drawShapeMarker(page, points[0], points[1], annotation.startMarker, annotation);
      drawShapeMarker(page, points[1], points[0], annotation.endMarker, annotation);
      continue;
    }

    if (annotation.type === "shape" && annotation.shape === "polyline" && annotation.points?.length > 1) {
      const points = annotation.points.map((point) => pointToPdf(point, baseRotation, width, height));
      drawShapeSegments(page, points, annotation);
      drawShapeMarker(page, points[0], points[1], annotation.startMarker, annotation);
      drawShapeMarker(page, points.at(-1), points.at(-2), annotation.endMarker, annotation);
      continue;
    }

    const box = boxToPdf(annotation, baseRotation, width, height);
    if (annotation.type === "shape") {
      const strokeColor = parseColor(annotation.color || "#171717");
      const strokeWidth = Math.max(1, annotation.width || 1);
      const dashArray = pdfShapeDashArray(annotation.strokeStyle, strokeWidth);
      const borderOptions = {
        borderColor: strokeColor,
        borderWidth: strokeWidth,
        borderOpacity: annotation.opacity ?? 1,
        ...(dashArray.length ? { borderDashArray: dashArray } : {}),
      };
      const fillOptions = annotation.fill
        ? { color: parseColor(annotation.fill), opacity: annotation.fillOpacity ?? 1 }
        : {};
      if (annotation.shape === "smiley") {
        const radiusX = box.width / 2;
        const radiusY = box.height / 2;
        const center = { x: box.x + radiusX, y: box.y + radiusY };
        page.drawEllipse({
          x: center.x,
          y: center.y,
          xScale: radiusX,
          yScale: radiusY,
          ...borderOptions,
          ...fillOptions,
        });
        for (const eyeX of [center.x - radiusX * 0.3, center.x + radiusX * 0.3]) {
          page.drawEllipse({
            x: eyeX,
            y: center.y + radiusY * 0.2,
            xScale: Math.max(1, radiusX * 0.045),
            yScale: Math.max(1, radiusY * 0.045),
            color: strokeColor,
            opacity: annotation.opacity ?? 1,
          });
        }
        let previous = {
          x: center.x - radiusX * 0.48,
          y: center.y - radiusY * 0.06,
        };
        for (let index = 1; index <= 12; index++) {
          const offset = -0.48 + (0.96 * index) / 12;
          const next = {
            x: center.x + radiusX * offset,
            y: center.y - radiusY * (0.06 + 0.25 * (1 - (offset / 0.48) ** 2)),
          };
          page.drawLine({ start: previous, end: next, thickness: strokeWidth, color: strokeColor, opacity: annotation.opacity ?? 1 });
          previous = next;
        }
      } else if (annotation.shape === "ellipse") {
        page.drawEllipse({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          xScale: box.width / 2,
          yScale: box.height / 2,
          ...borderOptions,
          ...fillOptions,
        });
      } else if (["arc", "pentagon", "cloud", "polyline", "arrow"].includes(annotation.shape)) {
        const localPoint = (x, y) =>
          pointToPdf(
            { x: annotation.x + annotation.w * x, y: annotation.y + annotation.h * y },
            baseRotation,
            width,
            height
          );
        const paths = {
          arc: Array.from({ length: 21 }, (_, index) => {
            const t = index / 20;
            const u = 1 - t;
            return { x: 0.05 + 0.9 * t, y: 0.9 * (u * u * 0.9 + 2 * u * t * 0.08 + t * t * 0.9) };
          }),
          pentagon: [
            { x: 0.5, y: 0.05 }, { x: 0.95, y: 0.38 }, { x: 0.78, y: 0.92 },
            { x: 0.22, y: 0.92 }, { x: 0.05, y: 0.38 }, { x: 0.5, y: 0.05 },
          ],
          cloud: [
            { x: 0.22, y: 0.76 }, { x: 0.1, y: 0.76 }, { x: 0.08, y: 0.53 },
            { x: 0.2, y: 0.47 }, { x: 0.15, y: 0.28 }, { x: 0.39, y: 0.19 },
            { x: 0.5, y: 0.35 }, { x: 0.63, y: 0.13 }, { x: 0.88, y: 0.25 },
            { x: 0.84, y: 0.47 }, { x: 1, y: 0.53 }, { x: 0.96, y: 0.77 }, { x: 0.78, y: 0.77 },
            { x: 0.22, y: 0.76 },
          ],
          polyline: [
            { x: 0.05, y: 0.78 }, { x: 0.31, y: 0.35 }, { x: 0.56, y: 0.62 }, { x: 0.95, y: 0.18 },
          ],
          arrow: [
            { x: 0.05, y: 0.5 }, { x: 0.85, y: 0.5 },
            { x: 0.62, y: 0.27 }, { x: 0.85, y: 0.5 }, { x: 0.62, y: 0.73 },
          ],
        };
        const points = paths[annotation.shape].map((point) => localPoint(point.x, point.y));
        const closed = annotation.shape === "pentagon" || annotation.shape === "cloud";
        if (closed && annotation.fill) {
          const svgPath = `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
          page.drawSvgPath(svgPath, { x: 0, y: 0, color: parseColor(annotation.fill), opacity: annotation.fillOpacity ?? 1 });
        }
        drawShapeSegments(page, points, annotation, { close: closed });
      } else {
        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          ...borderOptions,
          ...fillOptions,
        });
      }
      continue;
    }

    if (annotation.type === "image") {
      let image = images.get(annotation.dataUrl);
      if (!image) {
        const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(annotation.dataUrl || "");
        if (!match) throw new Error("An inserted image has invalid embedded data.");
        const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
        image = match[1] === "image/png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
        images.set(annotation.dataUrl, image);
      }
      page.drawImage(image, { x: box.x, y: box.y, width: box.width, height: box.height });
      continue;
    }

    if (annotation.type === "attachment") {
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(annotation.dataUrl || "");
      if (!match) throw new Error("An attached file has invalid embedded data.");
      const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
      await document.attach(bytes, annotation.name || "attachment", {
        mimeType: annotation.mimeType || match[1],
        description: `Attached from PrivyPDF: ${annotation.name || "file"}`,
      });
      if (!fonts.has(StandardFonts.Helvetica)) {
        fonts.set(StandardFonts.Helvetica, await document.embedFont(StandardFonts.Helvetica));
      }
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        borderColor: rgb(0.5, 0.55, 0.62),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });
      const label = (annotation.name || "Attachment").slice(0, 40);
      page.drawText(`Attachment: ${label}`, {
        x: box.x + 5,
        y: box.y + Math.max(2, (box.height - 9) / 2),
        size: Math.min(9, Math.max(6, box.height * 0.6)),
        font: fonts.get(StandardFonts.Helvetica),
        color: rgb(0.12, 0.16, 0.22),
        maxWidth: Math.max(1, box.width - 10),
      });
      continue;
    }

    if (annotation.type === "highlight") {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color,
        opacity: annotation.opacity ?? 0.34,
      });
      continue;
    }

    if (annotation.type === "replace") {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: parseColor(annotation.fill),
      });
    }

    if (annotation.type === "text" && annotation.fill) {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: parseColor(annotation.fill),
        opacity: annotation.opacity ?? 1,
      });
    }

    if (annotation.type === "text" && annotation.strokeWidth > 0) {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        borderColor: parseColor(annotation.strokeColor || annotation.color),
        borderWidth: annotation.strokeWidth,
        borderOpacity: annotation.opacity ?? 1,
      });
    }

    if (annotation.type === "text" || annotation.type === "replace") {
      const family = annotation.fontFamily || "Helvetica";
      const bold = annotation.fontWeight === "bold" || annotation.weight === "bold";
      const italic = annotation.fontStyle === "italic";
      const fontKey = family === "Courier"
        ? bold ? (italic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold) : (italic ? StandardFonts.CourierOblique : StandardFonts.Courier)
        : family === "TimesRoman"
          ? bold ? (italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold) : (italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman)
          : bold ? (italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold) : (italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
      if (!fonts.has(fontKey)) fonts.set(fontKey, await document.embedFont(fontKey));
      const font = fonts.get(fontKey);
      let fontSize = Math.max(6, Math.min(72, Number(annotation.fontSize) || 12));
      const targetWidth = box.width;
      if (annotation.autoFit) {
        const textWidth = font.widthOfTextAtSize(annotation.text || "", fontSize);
        if (textWidth > Math.max(1, targetWidth - 4)) {
          fontSize *= Math.max(1, targetWidth - 4) / textWidth;
        }
        fontSize = Math.min(fontSize, box.height);
      }
      const textWidth = font.widthOfTextAtSize(annotation.text || "", fontSize);
      const offset =
        annotation.align === "center"
          ? Math.max(0, (targetWidth - textWidth) / 2)
          : annotation.align === "right"
            ? Math.max(0, targetWidth - textWidth)
            : 2;
      const baseline = pointToPdf(
        { x: annotation.x, y: annotation.y + annotation.h },
        baseRotation,
        width,
        height
      );
      const verticalOffset = annotation.verticalAlign === "top"
        ? Math.max(0, box.height - fontSize)
        : annotation.verticalAlign === "bottom"
          ? 0
          : Math.max(0, (box.height - fontSize) / 2);
      page.drawText(annotation.text || "", {
        x: baseline.x + offset,
        y: baseline.y + verticalOffset,
        size: fontSize,
        font,
        color: annotation.type === "replace" || annotation.color
          ? parseColor(annotation.color)
          : color,
        rotate: degrees(baseRotation),
        maxWidth: Math.max(1, targetWidth - 4),
        lineHeight: fontSize * 1.1,
        opacity: annotation.opacity ?? 1,
      });
      if (annotation.underline || annotation.strike) {
        const lineY = baseline.y + box.height / 2 + (annotation.strike ? fontSize * 0.3 : 0);
        page.drawLine({
          start: { x: box.x, y: lineY },
          end: { x: box.x + box.width, y: lineY },
          thickness: Math.max(0.6, fontSize / 18),
          color: annotation.color ? parseColor(annotation.color) : color,
          opacity: annotation.opacity ?? 1,
        });
      }
      if (annotation.link) {
        const context = document.context;
        const annotationRef = context.register(context.obj({
          Type: PDFName.of("Annot"),
          Subtype: PDFName.of("Link"),
          Rect: [box.x, box.y, box.x + box.width, box.y + box.height],
          Border: [0, 0, 0],
          A: {
            S: PDFName.of("URI"),
            URI: PDFString.of(annotation.link),
          },
        }));
        page.node.addAnnot(annotationRef);
      }
    }

  }
}

async function addFormFields(document, page, model, baseRotation = 0) {
  const fields = (model.annotations || []).filter((annotation) => annotation.type === "formField");
  if (!fields.length) return;
  const form = document.getForm();
  const width = page.getWidth();
  const height = page.getHeight();
  const indicatorFont = fields.some((annotation) => annotation.indicator)
    ? await document.embedFont(StandardFonts.Helvetica)
    : null;
  for (const annotation of fields) {
    const box = boxToPdf(annotation, baseRotation, width, height);
    const name = `privypdf.${annotation.id}`;
    const options = {
      x: box.x,
      y: box.y,
      width: Math.max(18, box.width),
      height: Math.max(16, box.height),
      borderWidth: 1,
      borderColor: parseColor(annotation.color),
      backgroundColor: rgb(1, 1, 1),
      textColor: rgb(0.1, 0.1, 0.1),
      fontSize: Math.max(8, Math.min(14, box.height * 0.6)),
    };
    const applyFieldProperties = (field) => {
      if (annotation.readOnly) field.enableReadOnly();
      if (annotation.required) field.enableRequired();
      return field;
    };
    switch (annotation.fieldType) {
      case "signature":
      case "text": {
        const field = applyFieldProperties(form.createTextField(name));
        if (annotation.multiline) field.enableMultiline();
        if (annotation.defaultValue) field.setText(annotation.defaultValue);
        field.addToPage(page, options);
        break;
      }
      case "checkbox": {
        applyFieldProperties(form.createCheckBox(name)).addToPage(page, options);
        break;
      }
      case "radio": {
        applyFieldProperties(form.createRadioGroup(name))
          .addOptionToPage(annotation.defaultValue || "Option 1", page, options);
        break;
      }
      case "dropdown": {
        const field = applyFieldProperties(form.createDropdown(name));
        if (annotation.options?.length) field.addOptions(annotation.options);
        if (annotation.defaultValue && annotation.options?.includes(annotation.defaultValue)) {
          field.select(annotation.defaultValue);
        }
        field.addToPage(page, options);
        break;
      }
      case "list": {
        const field = applyFieldProperties(form.createOptionList(name));
        if (annotation.options?.length) field.addOptions(annotation.options);
        if (annotation.multiSelect) field.enableMultiselect();
        if (annotation.defaultValue && annotation.options?.includes(annotation.defaultValue)) {
          field.select(annotation.defaultValue);
        }
        field.addToPage(page, options);
        break;
      }
      default:
        throw new Error(`Unsupported form field type: ${annotation.fieldType}`);
    }
    if (annotation.indicator && indicatorFont) {
      page.drawText("*", {
        x: box.x >= 6 ? box.x - 6 : box.x + box.width + 2,
        y: box.y + Math.max(1, box.height * 0.25),
        size: Math.min(10, Math.max(6, box.height * 0.45)),
        font: indicatorFont,
        color: rgb(0.8, 0.12, 0.12),
      });
    }
  }
}

/** Builds a brand-new PDF from the page models. Runs entirely in this tab. */
export async function exportPdf(pages, sources, { title } = {}) {
  const out = await PDFDocument.create();
  const embedded = new Map();

  // Copy pages per source in one call so shared resources (fonts, images) are not duplicated.
  const copied = new Map();
  for (const [sourceId, src] of sources) {
    if (src.kind !== "pdf") continue;
    const wanted = pages.filter((p) => p.kind === "pdf" && p.sourceId === sourceId);
    if (!wanted.length) continue;
    const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true, updateMetadata: false });
    const result = await out.copyPages(
      doc,
      wanted.map((p) => p.index)
    );
    wanted.forEach((p, i) => copied.set(p.id, result[i]));
  }

  for (const p of pages) {
    if (p.kind === "pdf") {
      const page = copied.get(p.id);
      const base = page.getRotation().angle;
      page.setRotation(degrees((base + p.rotation) % 360));
      await applyTextEdits(out, page, p, base);
      await drawAnnotations(out, page, p, base);
      out.addPage(page);
      await addFormFields(out, page, p, base);
    } else if (p.kind === "image") {
      const src = sources.get(p.sourceId);
      let img = embedded.get(p.sourceId);
      if (!img) {
        img = src.type === "image/png" ? await out.embedPng(src.bytes) : await out.embedJpg(src.bytes);
        embedded.set(p.sourceId, img);
      }
      const page = out.addPage([p.width, p.height]);
      page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
      page.setRotation(degrees(p.rotation));
      await drawAnnotations(out, page, p);
      await addFormFields(out, page, p);
    } else {
      const page = out.addPage([p.width, p.height]);
      page.setRotation(degrees(p.rotation));
      await drawAnnotations(out, page, p);
      await addFormFields(out, page, p);
    }
  }

  if (title) out.setTitle(title);
  out.setProducer("PrivyPDF (on-device)");
  out.setCreator("PrivyPDF");
  return out.save();
}

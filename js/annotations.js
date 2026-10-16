import * as pdfjs from "/vendor/pdfjs/pdf.min.js";
import { icon } from "./icons.js";
import { validateTextEdit } from "./pdf-viewer.js";
import { isTextMarkAnnotation, TEXT_MARK_TOOLS } from "./text-marks.js";
import {
  applyFormattingRange,
  formattingTextSegments,
  normalizeFormattingRanges,
  remapFormattingRanges,
  remapTextRange,
  styleForTextRange,
  validateTextRange,
} from "./text-ranges.js";

export function selectFromEvent(state, id, event, indexOf, renderSelection) {
  if (event.shiftKey && state.anchorId) {
    const anchorIndex = indexOf(state.anchorId);
    const targetIndex = indexOf(id);
    const [start, end] =
      anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    if (!(event.metaKey || event.ctrlKey)) state.selected.clear();
    for (let index = start; index <= end; index++) state.selected.add(state.pages[index].id);
  } else if (event.metaKey || event.ctrlKey) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    state.anchorId = id;
  } else {
    state.selected = new Set([id]);
    state.anchorId = id;
  }
  state.focusId = id;
  renderSelection();
}

const clamp = (value) => Math.max(0, Math.min(1, value));

function screenToBaseline(point, rotation) {
  switch (rotation % 360) {
    case 90:
      return { x: point.y, y: 1 - point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: 1 - point.y, y: point.x };
    default:
      return point;
  }
}

function baselineToScreen(point, rotation) {
  switch (rotation % 360) {
    case 90:
      return { x: 1 - point.y, y: point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
}

function colorInputValue(color, fallback = "#171717") {
  if (typeof color !== "string") return fallback;
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1].length === 3
      ? [...hex[1]].map((channel) => channel + channel).join("")
      : hex[1];
    return `#${value.toLowerCase()}`;
  }
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!rgb) return fallback;
  return `#${rgb.slice(1, 4)
    .map((channel) => Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function projectBox(box, rotation) {
  const points = [
    baselineToScreen({ x: box.x, y: box.y }, rotation),
    baselineToScreen({ x: box.x + box.w, y: box.y }, rotation),
    baselineToScreen({ x: box.x, y: box.y + box.h }, rotation),
    baselineToScreen({ x: box.x + box.w, y: box.y + box.h }, rotation),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function annotationBox(annotation) {
  if (annotation.points?.length) {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (annotation.type === "shape" && annotation.shape === "line") {
    const x = Math.min(annotation.x, annotation.x + annotation.w);
    const y = Math.min(annotation.y, annotation.y + annotation.h);
    return { x, y, w: Math.abs(annotation.w), h: Math.abs(annotation.h) };
  }
  return { x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h };
}

function geometryPatch(annotation, from, box) {
  const scaleX = from.w > 0 ? box.w / from.w : 1;
  const scaleY = from.h > 0 ? box.h / from.h : 1;
  const mapPoint = (point) => ({
    x: box.x + (point.x - from.x) * scaleX,
    y: box.y + (point.y - from.y) * scaleY,
  });
  if (annotation.points?.length) {
    const points = annotation.points.map(mapPoint);
    if (annotation.type === "draw") return { points };
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { points, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (annotation.type === "shape" && annotation.shape === "line") {
    const start = mapPoint({ x: annotation.x, y: annotation.y });
    const end = mapPoint({ x: annotation.x + annotation.w, y: annotation.y + annotation.h });
    return { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y };
  }
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function getTextBox(item, page, scale) {
  const tx = pdfjs.Util.transform(item.viewport.transform, item.transform);
  const fontSize = Math.max(1, Math.hypot(tx[2], tx[3]));
  return {
    x: clamp(tx[4] / (page.width * scale)),
    y: clamp((tx[5] - fontSize) / (page.height * scale)),
    w: clamp(item.width / page.width),
    h: clamp((fontSize * 1.25) / (page.height * scale)),
  };
}

function sampleTextAppearance(canvas, textElement) {
  if (!canvas || !textElement || !canvas.width || !canvas.height) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const textRect = textElement.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height || !textRect.width || !textRect.height) return null;

  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const left = Math.max(0, Math.floor((textRect.left - canvasRect.left) * scaleX));
  const top = Math.max(0, Math.floor((textRect.top - canvasRect.top) * scaleY));
  const right = Math.min(canvas.width, Math.ceil((textRect.right - canvasRect.left) * scaleX));
  const bottom = Math.min(canvas.height, Math.ceil((textRect.bottom - canvasRect.top) * scaleY));
  if (right <= left || bottom <= top) return null;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  let pixels;
  try {
    pixels = context.getImageData(left, top, right - left, bottom - top);
  } catch (error) {
    if (error?.name !== "SecurityError") throw error;
    console.warn("Couldn't sample the PDF page colors for the text-edit preview.", error);
    return null;
  }

  const borderX = Math.max(1, Math.round(Math.min(3, textRect.width * 0.18) * scaleX));
  const borderY = Math.max(1, Math.round(Math.min(3, textRect.height * 0.2) * scaleY));
  const width = right - left;
  const height = bottom - top;
  const backgroundBins = new Map();
  const inkBins = new Map();
  const addToBin = (bins, red, green, blue) => {
    const key = `${red >> 4},${green >> 4},${blue >> 4}`;
    const bin = bins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bin.count++;
    bin.red += red;
    bin.green += green;
    bin.blue += blue;
    bins.set(key, bin);
  };
  const colorDistance = (red, green, blue, color) =>
    Math.hypot(red - color.red, green - color.green, blue - color.blue);
  const mostCommon = (bins) =>
    [...bins.values()].sort((leftBin, rightBin) => rightBin.count - leftBin.count)[0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (pixels.data[offset + 3] < 240) continue;
      const red = pixels.data[offset];
      const green = pixels.data[offset + 1];
      const blue = pixels.data[offset + 2];
      if (x < borderX || x >= width - borderX || y < borderY || y >= height - borderY) {
        addToBin(backgroundBins, red, green, blue);
      }
    }
  }

  const backgroundBin = mostCommon(backgroundBins);
  if (!backgroundBin) return null;
  const background = {
    red: Math.round(backgroundBin.red / backgroundBin.count),
    green: Math.round(backgroundBin.green / backgroundBin.count),
    blue: Math.round(backgroundBin.blue / backgroundBin.count),
  };

  for (let y = borderY; y < height - borderY; y++) {
    for (let x = borderX; x < width - borderX; x++) {
      const offset = (y * width + x) * 4;
      if (pixels.data[offset + 3] < 240) continue;
      const red = pixels.data[offset];
      const green = pixels.data[offset + 1];
      const blue = pixels.data[offset + 2];
      if (colorDistance(red, green, blue, background) >= 48) {
        addToBin(inkBins, red, green, blue);
      }
    }
  }

  const inkBin = mostCommon(inkBins);
  return {
    fill: `rgb(${background.red}, ${background.green}, ${background.blue})`,
    color: inkBin
      ? `rgb(${Math.round(inkBin.red / inkBin.count)}, ${Math.round(inkBin.green / inkBin.count)}, ${Math.round(inkBin.blue / inkBin.count)})`
      : null,
  };
}

function getPdfFontMetadata(pdfPage, fontName) {
  const font = pdfPage.commonObjs.get(fontName);
  return {
    loadedName: font.loadedName,
    bold: font.bold || font.black,
    italic: font.italic,
  };
}

function resolveFontFamily(style, fontMetadata) {
  const loadedName = fontMetadata?.loadedName;
  if (loadedName) return `"${loadedName.replaceAll('"', '\\"')}"`;

  const styleFamily = style?.fontFamily;
  return styleFamily && !/^(sans-serif|serif|monospace)$/i.test(styleFamily)
    ? styleFamily
    : "Arial, sans-serif";
}

function editorFontFamily(fontFamily) {
  if (fontFamily === "Helvetica") return "Arial, sans-serif";
  if (fontFamily === "TimesRoman") return '"Times New Roman", serif';
  if (fontFamily === "Courier") return '"Courier New", monospace';
  return fontFamily || "Arial, sans-serif";
}

function findTableCells(items) {
  if (items.length < 2) return [];

  const rowTolerance = Math.max(0.002, ...items.map((item) => item.h)) * 0.3;
  const rows = [];
  const ordered = [...items].sort((a, b) => a.centerY - b.centerY);
  let currentRow = [];

  for (const item of ordered) {
    const previous = currentRow[currentRow.length - 1];
    if (!previous || Math.abs(item.centerY - previous.centerY) <= rowTolerance) {
      currentRow.push(item);
      continue;
    }
    rows.push(currentRow);
    currentRow = [item];
  }
  if (currentRow.length) rows.push(currentRow);
  if (rows.length < 2) return [];

  const cells = [];
  for (const row of rows) {
    const sortedRow = [...row].sort((a, b) => a.x - b.x);
    const clusters = [];
    let cluster = [sortedRow[0]];

    for (let index = 1; index < sortedRow.length; index++) {
      const item = sortedRow[index];
      const previous = cluster[cluster.length - 1];
      const gap = item.x - (previous.x + previous.w);
      const columnTolerance = Math.max(0.003, previous.h * 0.65, item.h * 0.65);
      if (gap <= columnTolerance) {
        cluster.push(item);
      } else {
        clusters.push(cluster);
        cluster = [item];
      }
    }
    if (cluster.length) clusters.push(cluster);
    if (clusters.length < 2) continue;

    for (const clusterItems of clusters) {
      const sortedCluster = [...clusterItems].sort((a, b) => a.x - b.x);
      const text = sortedCluster.map((item) => item.str).join(" ").trim();
      if (!text || sortedCluster.length === 1 && text === sortedCluster[0].str && sortedCluster[0].str.trim().length < 2) {
        continue;
      }
      const left = Math.min(...sortedCluster.map((item) => item.x));
      const right = Math.max(...sortedCluster.map((item) => item.x + item.w));
      const top = Math.min(...sortedCluster.map((item) => item.y));
      const bottom = Math.max(...sortedCluster.map((item) => item.y + item.h));
      cells.push({
        text,
        x: left,
        y: top,
        w: Math.max(right - left, 0.01),
        h: Math.max(bottom - top, 0.01),
        items: sortedCluster,
      });
    }
  }

  return cells;
}

function multiplyTransform(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function findGridCells(operatorList, viewport, page) {
  const ops = pdfjs.OPS;
  const segments = [];
  const stateStack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let skippedViewportTransform = false;
  const viewportTransform = viewport.transform;
  const isViewportTransform = (candidate) =>
    candidate?.length === viewportTransform.length &&
    candidate.every((value, index) => Math.abs(value - viewportTransform[index]) < 0.001);
  const transformPoint = (x, y) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  });

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];
    if (fn === ops.save) {
      stateStack.push(matrix.slice());
    } else if (fn === ops.restore) {
      matrix = stateStack.pop() || matrix;
    } else if (fn === ops.transform && args) {
      if (!skippedViewportTransform && isViewportTransform(args)) {
        skippedViewportTransform = true;
      } else {
        matrix = multiplyTransform(matrix, args);
      }
    } else if (
      fn === ops.constructPath &&
      args?.[1]?.[0] &&
      (args[0] === ops.stroke || args[0] === ops.closeStroke)
    ) {
      const path = args[1][0];
      let offset = 0;
      let start = null;
      let current = null;
      while (offset < path.length) {
        const command = path[offset++];
        if (command === 0 || command === 1) {
          const point = transformPoint(path[offset++], path[offset++]);
          if (command === 0) {
            current = point;
            start = point;
          } else {
            if (current) segments.push([current, point]);
            current = point;
          }
        } else if (command === 2) {
          offset += 6;
        } else if (command === 3) {
          offset += 4;
        } else if (command === 4) {
          if (current && start) segments.push([current, start]);
          current = start;
        } else {
          break;
        }
      }
    }
  }

  const verticals = [];
  const horizontals = [];
  for (const [[x1, y1], [x2, y2]] of segments.map(([a, b]) => [[a.x, a.y], [b.x, b.y]])) {
    if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) > 6) {
      verticals.push({ x: (x1 + x2) / 2, start: Math.min(y1, y2), end: Math.max(y1, y2) });
    } else if (Math.abs(y1 - y2) < 1 && Math.abs(x1 - x2) > 6) {
      horizontals.push({ y: (y1 + y2) / 2, start: Math.min(x1, x2), end: Math.max(x1, x2) });
    }
  }

  const clusterCoordinates = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const clusters = [];
    for (const value of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || value - last[last.length - 1] > 1.5) clusters.push([value]);
      else last.push(value);
    }
    return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length);
  };
  const xs = clusterCoordinates(verticals.map((line) => line.x));
  const ys = clusterCoordinates(horizontals.map((line) => line.y));
  if (xs.length < 3 || ys.length < 3) return [];

  const hasVertical = (x, y1, y2) =>
    verticals.some(
      (line) =>
        Math.abs(line.x - x) <= 1.5 &&
        line.start <= y1 + 1.5 &&
        line.end >= y2 - 1.5
    );
  const hasHorizontal = (y, x1, x2) =>
    horizontals.some(
      (line) =>
        Math.abs(line.y - y) <= 1.5 &&
        line.start <= x1 + 1.5 &&
        line.end >= x2 - 1.5
    );
  const cells = [];
  for (let column = 1; column < xs.length; column++) {
    const left = xs[column - 1];
    const right = xs[column];
    for (let row = 1; row < ys.length; row++) {
      const top = ys[row - 1];
      const bottom = ys[row];
      if (
        right - left < 8 ||
        bottom - top < 6 ||
        !hasVertical(left, top, bottom) ||
        !hasVertical(right, top, bottom) ||
        !hasHorizontal(top, left, right) ||
        !hasHorizontal(bottom, left, right)
      ) {
        continue;
      }
      cells.push({
        x: clamp(left / page.width),
        y: clamp(top / page.height),
        w: clamp((right - left) / page.width),
        h: clamp((bottom - top) / page.height),
        items: [],
      });
    }
  }

  return cells.length >= 4 ? cells : [];
}

function assignItemsToGridCells(items, gridCells) {
  if (!gridCells.length) return [];
  const cells = gridCells.map((cell) => ({ ...cell, items: [] }));
  for (const item of items) {
    const centerX = item.box.x + item.box.w / 2;
    const centerY = item.box.y + item.box.h / 2;
    const cell = cells
      .filter(
        (candidate) =>
          centerX >= candidate.x &&
          centerX <= candidate.x + candidate.w &&
          centerY >= candidate.y &&
          centerY <= candidate.y + candidate.h
      )
      .sort((left, right) => left.w * left.h - right.w * right.h)[0];
    cell?.items.push(item);
  }

  for (const cell of cells) {
    if (!cell.items.length) continue;
    cell.items.sort((left, right) => left.x - right.x);
    cell.text = cell.items.map((item) => item.str).join(" ").trim();
    const left = Math.min(...cell.items.map((item) => item.box.x));
    const right = Math.max(...cell.items.map((item) => item.box.x + item.box.w));
    const top = Math.min(...cell.items.map((item) => item.box.y));
    const bottom = Math.max(...cell.items.map((item) => item.box.y + item.box.h));
    cell.textBox = {
      x: left,
      y: top,
      w: Math.max(right - left, 0.005),
      h: Math.max(bottom - top, 0.008),
    };
  }
  return cells;
}

export function createAnnotationEditor({
  state,
  commit,
  render,
  renderThumbnail,
  toast,
  els,
  beginBusy,
}) {
  let pointer = null;
  let livePath = null;
  let liveShape = null;
  let objectDrag = null;
  let svgDrag = null;
  let pageDrag = null;
  let suppressBackgroundClick = false;
  let suppressObjectClick = false;
  let suppressPdfTextClick = false;
  let suppressPdfTextClickTimer = null;
  function suppressNextPdfTextClick() {
    suppressPdfTextClick = true;
    clearTimeout(suppressPdfTextClickTimer);
    suppressPdfTextClickTimer = setTimeout(() => {
      suppressPdfTextClick = false;
      suppressPdfTextClickTimer = null;
    }, 250);
  }

  function consumeSuppressedPdfTextClick(event) {
    if (!suppressPdfTextClick) return false;
    suppressPdfTextClick = false;
    clearTimeout(suppressPdfTextClickTimer);
    suppressPdfTextClickTimer = null;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  const passiveTools = new Set([
    "none",
    "eraser",
    "highlight",
    "annotate-underline",
    "annotate-squiggle",
    "annotate-strike",
    "stamp-place",
    "signature-place",
  ]);
  const canManipulate = () => !passiveTools.has(state.annotationTool);
  const inlineEditBases = new WeakMap();
  const textOptionsToggle = document.getElementById("text-options-toggle");
  const textOptionsMenu = document.getElementById("text-insert-options");
  const textInsertDefaults = {
    fontFamily: "Helvetica",
    fontSize: 24,
    fontWeight: "normal",
    fontStyle: "normal",
    underline: false,
    color: "#171717",
    fill: null,
    align: "left",
    verticalAlign: "middle",
    autoFit: false,
    opacity: 1,
    strokeWidth: 0,
  };
  const annotationToolStyles = new Map();
  const customAnnotationColors = [];
  const extraAnnotationColors = ["#171717", "#ffffff", "#64748b", "#ec4899", "#14b8a6", "#84cc16", "#facc15"];
  const annotationToolNames = {
    highlight: "Highlight Tool",
    "annotate-underline": "Underline Tool",
    "annotate-squiggle": "Squiggly Underline Tool",
    "annotate-strike": "Strikethrough Tool",
    draw: "Free Hand Highlight Tool",
    text: "Free Text Tool",
  };
  const annotationStyleTools = new Set(Object.keys(annotationToolNames));
  const textMarkupTools = new Set(TEXT_MARK_TOOLS);
  const shapeToolNames = {
    "shape-rect": "Rectangle Tool",
    "shape-ellipse": "Ellipse Tool",
    "shape-arc": "Arc Tool",
    "shape-pentagon": "Pentagon Tool",
    "shape-cloud": "Cloud Tool",
    "shape-line": "Line Tool",
    "shape-polyline": "Polyline Tool",
    "shape-arrow": "Arrow Tool",
    "shape-smiley": "Smiley Tool",
  };
  const shapeToolStyles = new Map();
  const shapeExtraColors = ["#171717", "#ffffff", "#64748b", "#ec4899", "#14b8a6", "#84cc16", "#facc15"];
  const customShapeStrokeColors = [];
  const customShapeFillColors = [];
  const fillableShapes = new Set(["rect", "ellipse", "pentagon", "cloud", "smiley"]);
  const formToolDefaults = {
    "form-signature": { width: 180, height: 40, required: false, readOnly: false, indicator: true, options: [] },
    "form-text": { width: 200, height: 40, value: "", required: false, readOnly: false, multiline: false, indicator: true, options: [] },
    "form-label": { width: 200, height: 40, value: "", options: [] },
    "form-checkbox": { width: 20, height: 20, required: false, readOnly: false, indicator: true, options: [] },
    "form-radio": { width: 20, height: 20, required: false, readOnly: false, indicator: true, options: [] },
    "form-dropdown": { width: 200, height: 40, required: false, readOnly: false, indicator: true, options: ["Option 1", "Option 2", "Option 3"] },
    "form-list": { width: 200, height: 80, required: false, readOnly: false, multiSelect: false, indicator: true, options: ["Option 1", "Option 2", "Option 3"] },
  };
  const formToolLabels = {
    "form-signature": "Signature",
    "form-text": "Text Field",
    "form-label": "Free Text",
    "form-checkbox": "Checkbox",
    "form-radio": "Radio Button",
    "form-dropdown": "Dropdown",
    "form-list": "List Box Field",
  };
  const builtInStamps = [
    { label: "APPROVED", color: "#16794f", fill: "#e8f5ec" },
    { label: "AS IS", color: "#32465a", fill: "#edf2f7" },
    { label: "COMPLETED", color: "#16794f", fill: "#e8f5ec" },
    { label: "CONFIDENTIAL", color: "#334155", fill: "#e7eaf1" },
    { label: "DEPARTMENTAL", color: "#334155", fill: "#e7eaf1" },
    { label: "DRAFT", color: "#334155", fill: "#e7eaf1" },
    { label: "EXPERIMENTAL", color: "#334155", fill: "#e7eaf1" },
    { label: "EXPIRED", color: "#b42318", fill: "#fde8e7" },
    { label: "FINAL", color: "#4d7c0f", fill: "#edf6d8" },
    { label: "FOR COMMENT", color: "#334155", fill: "#e7eaf1" },
    { label: "FOR PUBLIC RELEASE", color: "#334155", fill: "#e7eaf1" },
    { label: "INFORMATION ONLY", color: "#334155", fill: "#e7eaf1" },
    { label: "PRELIMINARY RESULTS", color: "#334155", fill: "#e7eaf1" },
    { label: "SOLD", color: "#334155", fill: "#e7eaf1" },
    { label: "TOP SECRET", color: "#334155", fill: "#e7eaf1" },
    { label: "VOID", color: "#b42318", fill: "#fde8e7" },
    { label: "SIGN HERE", color: "#8f251d", fill: "#e98980" },
    { label: "WITNESS", color: "#866400", fill: "#fff1a6" },
    { label: "INITIAL HERE", color: "#593b95", fill: "#b99be8" },
    { label: "CHECK", color: "#16794f", fill: "#e8f5ec" },
    { label: "X", color: "#b42318", fill: "#fde8e7" },
  ];
  const customStamps = [];
  const savedSignatures = [];
  let activeStamp = null;
  let activeSignatureId = null;
  let signatureMode = "draw";
  let signatureColor = "#171717";
  let signatureUpload = null;
  let signaturePaths = [];
  let signatureDrawing = null;
  let formOptionCounter = 3;
  document.body.append(textOptionsMenu);

  function closeTextOptions() {
    textOptionsMenu.hidden = true;
    textOptionsToggle.setAttribute("aria-expanded", "false");
    syncToolOptionsRow();
  }

  function syncToolOptionsRow() {
    document.body.classList.toggle(
      "has-tool-options",
      Boolean(document.querySelector(
        ".text-insert-options:not([hidden]), .shape-menu:not([hidden]), .edit-tool-menu:not([hidden])"
      ))
    );
  }

  function positionTextOptions() {
    const toolbar = document.querySelector(".toolbar");
    textOptionsMenu.style.left = "0px";
    textOptionsMenu.style.top = `${toolbar.getBoundingClientRect().bottom}px`;
  }

  function renderTextOptions() {
    const annotation = activeAnnotation();
    const values = annotation?.type === "text" ? annotation : textInsertDefaults;
    document.getElementById("insert-text-font").value = values.fontFamily || "Helvetica";
    document.getElementById("insert-text-size").value = String(values.fontSize || 24);
    document.getElementById("insert-text-color").value = values.color || "#171717";
    document.getElementById("insert-text-fill-enabled").checked = Boolean(values.fill);
    document.getElementById("insert-text-fill").value = values.fill || "#fff2a8";
    document.getElementById("insert-text-fill").disabled = !values.fill;
    document.getElementById("insert-text-align").value = values.align || "left";
    document.querySelectorAll("[data-insert-format]").forEach((button) => {
      const active = button.dataset.insertFormat === "bold"
        ? values.fontWeight === "bold"
        : button.dataset.insertFormat === "italic"
          ? values.fontStyle === "italic"
          : Boolean(values.underline);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
  }

  function updateInsertTextStyle(patch) {
    Object.assign(textInsertDefaults, patch);
    const annotation = activeAnnotation();
    if (annotation?.type === "text") updateAnnotation(annotation, patch);
    renderTextOptions();
  }

  function currentPage() {
    return state.pages.find((page) => page.id === state.textSelection?.pageId);
  }

  function focusAndSelect(element, selectAll = true) {
    element.focus();
    if (selectAll) {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }

  function focusEditable(annotationId, className, attempt = 0) {
    const editable = els.pages.querySelector(
      `[data-annotation-id="${annotationId}"] .${className}`
    );
    if (editable) {
      if (className === "annotation-inline-edit-text") {
        editable.contentEditable = "true";
      }
      focusAndSelect(editable);
    } else if (attempt < 60) {
      requestAnimationFrame(() => focusEditable(annotationId, className, attempt + 1));
    }
  }

  function focusEditableAtPoint(annotationId, className, point, attempt = 0) {
    const editable = els.pages.querySelector(
      `[data-annotation-id="${annotationId}"] .${className}`
    );
    if (!editable) {
      if (attempt < 60) {
        requestAnimationFrame(() =>
          focusEditableAtPoint(annotationId, className, point, attempt + 1)
        );
      }
      return;
    }

    editable.contentEditable = "true";
    editable.focus();
    const selection = window.getSelection();
    if (!selection) return;

    const caretPosition = document.caretPositionFromPoint?.(point.x, point.y);
    const caretRange = document.caretRangeFromPoint?.(point.x, point.y);
    let range = null;
    if (caretPosition && editable.contains(caretPosition.offsetNode)) {
      range = document.createRange();
      const maxOffset = caretPosition.offsetNode.nodeType === Node.TEXT_NODE
        ? caretPosition.offsetNode.textContent?.length || 0
        : caretPosition.offsetNode.childNodes.length;
      range.setStart(
        caretPosition.offsetNode,
        Math.min(caretPosition.offset, maxOffset)
      );
    } else if (caretRange && editable.contains(caretRange.startContainer)) {
      range = caretRange;
    } else {
      const textNode = [...editable.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (!textNode) return;
      const text = textNode.textContent || "";
      let nearestOffset = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let offset = 0; offset <= text.length; offset++) {
        const candidate = document.createRange();
        candidate.setStart(textNode, offset);
        candidate.collapse(true);
        const rect = candidate.getBoundingClientRect();
        const distance = Math.abs(point.x - rect.left);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestOffset = offset;
        }
      }
      range = document.createRange();
      range.setStart(textNode, nearestOffset);
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function fitCellText(input, annotation, box, page, scale = state.zoom) {
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return;
    const rotated = page.rotation % 180 !== 0;
    const pageWidth = rotated ? page.height : page.width;
    measure.font = `${annotation.fontStyle || "normal"} ${annotation.fontWeight || "normal"} ${Math.max(6, (annotation.fontSize || 9) * scale)}px ${editorFontFamily(annotation.fontFamily)}`;
    const contentWidth = measure.measureText(annotation.text || "").width;
    const availableWidth = Math.max(1, box.w * pageWidth * scale - 4);
    input.style.transform = `scaleX(${contentWidth > availableWidth ? availableWidth / contentWidth : 1})`;
  }

  function activeAnnotation() {
    const page = currentPage();
    return page?.annotations?.find((annotation) => annotation.id === state.textSelection?.annotationId);
  }

  function annotationToolStyle(tool) {
    if (!annotationToolStyles.has(tool)) {
      annotationToolStyles.set(tool, {
        color: tool === "text" ? textInsertDefaults.color : "#eab308",
        opacity: tool === "highlight" ? 0.35 : tool === "draw" ? 0.5 : 1,
        width: tool === "text" ? 0 : 2,
      });
    }
    return annotationToolStyles.get(tool);
  }

  function annotationToolContext() {
    let tool = state.annotationTool;
    let selected = null;
    if (tool === "select") {
      selected = activeAnnotation();
      if (selected?.type === "highlight") tool = "highlight";
      else if (selected?.type === "draw" && !selected.signature) tool = selected.tool || "draw";
      else if (selected?.type === "text" && !selected.formLabel) tool = "text";
      else return null;
    }
    return annotationStyleTools.has(tool) ? { tool, selected } : null;
  }

  function shapeToolStyle(tool) {
    if (!shapeToolStyles.has(tool)) {
      shapeToolStyles.set(tool, {
        color: "#eab308",
        width: 1,
        opacity: 1,
        strokeStyle: "solid",
        fill: null,
        fillOpacity: 1,
        startMarker: "none",
        endMarker: "none",
      });
    }
    return shapeToolStyles.get(tool);
  }

  function shapeToolContext() {
    let tool = state.annotationTool;
    let selected = null;
    if (tool === "select") {
      selected = activeAnnotation();
      if (selected?.type !== "shape") return null;
      tool = `shape-${selected.shape}`;
    }
    return shapeToolNames[tool] ? { tool, shape: tool.slice("shape-".length), selected } : null;
  }

  function shapeDashArray(style, width = 1) {
    const patterns = {
      dashed: [width * 7, width * 4],
      dotted: [width, width * 3],
      "dash-dot": [width * 7, width * 3, width, width * 3],
      "long-dash": [width * 12, width * 4],
      wavy: [width * 1.5, width * 2],
    };
    return patterns[style] || [];
  }

  function colorAtOpacity(color, opacity) {
    return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
  }

  function setShapeSvgStroke(path, annotation) {
    const width = Math.max(1, annotation.width || 1);
    const dash = shapeDashArray(annotation.strokeStyle, width);
    path.setAttribute("stroke", annotation.color || "#171717");
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-opacity", String(annotation.opacity ?? 1));
    path.setAttribute("stroke-linecap", annotation.strokeStyle === "dotted" ? "round" : "round");
    path.setAttribute("stroke-linejoin", "round");
    if (dash.length) path.setAttribute("stroke-dasharray", dash.join(" "));
  }

  function addShapeSvgMarkers(svg, path, annotation) {
    if (!annotation.startMarker && !annotation.endMarker) return;
    const definitions = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const addMarker = (position, kind) => {
      if (!kind || kind === "none") return;
      const id = `shape-${position}-${crypto.randomUUID()}`;
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", id);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", position === "start" ? "1" : "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("orient", position === "start" ? "auto-start-reverse" : "auto");
      marker.setAttribute("markerUnits", "strokeWidth");
      const color = annotation.color || "#171717";
      let markerShape;
      if (kind === "circle") {
        markerShape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        markerShape.setAttribute("cx", "5");
        markerShape.setAttribute("cy", "5");
        markerShape.setAttribute("r", "3.2");
        markerShape.setAttribute("fill", color);
      } else if (kind === "square") {
        markerShape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        markerShape.setAttribute("x", "1.8");
        markerShape.setAttribute("y", "1.8");
        markerShape.setAttribute("width", "6.4");
        markerShape.setAttribute("height", "6.4");
        markerShape.setAttribute("fill", color);
      } else {
        markerShape = document.createElementNS("http://www.w3.org/2000/svg", "path");
        markerShape.setAttribute("d", "M 1 1 L 9 5 L 1 9" + (kind === "triangle" ? " Z" : ""));
        markerShape.setAttribute("fill", kind === "triangle" ? color : "none");
        markerShape.setAttribute("stroke", color);
        markerShape.setAttribute("stroke-width", "1.5");
      }
      marker.append(markerShape);
      definitions.append(marker);
      path.setAttribute(`marker-${position}`, `url(#${id})`);
    };
    addMarker("start", annotation.startMarker);
    addMarker("end", annotation.endMarker);
    svg.prepend(definitions);
  }

  function renderShapePalette(paletteId, colorKind, customColors, selectedColor) {
    const palette = document.getElementById(paletteId);
    const presetAttribute = `data-shape-${colorKind}-preset`;
    const extraAttribute = `data-shape-${colorKind}-extra`;
    const customAttribute = `data-shape-${colorKind}-custom`;
    palette.querySelectorAll(`[${extraAttribute}], [${customAttribute}]`).forEach((button) => button.remove());
    shapeExtraColors.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "annotation-color-swatch";
      button.setAttribute(presetAttribute, color);
      button.setAttribute(extraAttribute, "true");
      button.style.setProperty("--swatch-color", color);
      button.setAttribute("aria-label", `${colorKind} color ${color}`);
      button.title = color;
      palette.append(button);
    });
    palette.querySelectorAll(`[${presetAttribute}]`).forEach((button) => {
      const color = button.getAttribute(presetAttribute).toLowerCase();
      button.style.setProperty("--swatch-color", color);
      button.classList.toggle("is-active", color === selectedColor?.toLowerCase());
    });
    palette.querySelectorAll(`[${customAttribute}]`).forEach((button) => button.remove());
    customColors.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "annotation-color-swatch";
      button.setAttribute(customAttribute, color);
      button.style.setProperty("--swatch-color", color);
      button.classList.toggle("is-active", color.toLowerCase() === selectedColor?.toLowerCase());
      button.setAttribute("aria-label", `Custom ${colorKind} color ${index + 1}`);
      button.title = color;
      palette.append(button);
    });
    const clear = palette.querySelector("[data-shape-fill-clear]");
    clear?.classList.toggle("is-active", !selectedColor);
    document.getElementById(`shape-${colorKind}-remove-color`).disabled = !customColors.length;
  }

  function renderShapeToolOptions() {
    const context = shapeToolContext();
    const options = document.getElementById("shape-tool-options");
    options.hidden = !context;
    if (!context) return;
    const { tool, shape, selected } = context;
    const defaults = shapeToolStyle(tool);
    const strokeColor = selected?.color || defaults.color;
    const strokeWidth = selected?.width ?? defaults.width;
    const strokeOpacity = selected?.opacity ?? defaults.opacity;
    const fillColor = selected?.fill ?? defaults.fill;
    const fillOpacity = selected?.fillOpacity ?? defaults.fillOpacity;
    document.getElementById("shape-tool-title").textContent = shapeToolNames[tool];
    document.getElementById("shape-stroke-color").value = strokeColor;
    document.getElementById("shape-stroke-width").value = String(Math.max(1, Math.min(20, Math.round(strokeWidth))));
    document.getElementById("shape-stroke-width-value").value = `${Math.round(strokeWidth)} pt`;
    document.getElementById("shape-stroke-opacity").value = String(Math.round(strokeOpacity * 100));
    document.getElementById("shape-stroke-opacity-value").value = `${Math.round(strokeOpacity * 100)}%`;
    document.getElementById("shape-stroke-style").value = selected?.strokeStyle || defaults.strokeStyle;
    document.getElementById("shape-start-marker").value = selected?.startMarker || defaults.startMarker;
    document.getElementById("shape-end-marker").value = selected?.endMarker || defaults.endMarker;
    document.getElementById("shape-endpoints").hidden = shape !== "line" && shape !== "polyline";
    document.getElementById("shape-fill-options").hidden = !fillableShapes.has(shape);
    document.getElementById("shape-fill-color").value = fillColor || "#fff2a8";
    document.getElementById("shape-fill-opacity").value = String(Math.round(fillOpacity * 100));
    document.getElementById("shape-fill-opacity-value").value = `${Math.round(fillOpacity * 100)}%`;
    els.annotationColor.value = strokeColor;
    renderShapePalette("shape-stroke-palette", "stroke", customShapeStrokeColors, strokeColor);
    renderShapePalette("shape-fill-palette", "fill", customShapeFillColors, fillColor);
  }

  function renderInsertToolOptions() {
    const tool = state.annotationTool;
    const showStamps = tool === "stamp-gallery" || tool === "stamp-place";
    const showSignatures = tool === "signature-library" || tool === "signature-place";
    const options = document.getElementById("insert-tool-options");
    options.hidden = !showStamps && !showSignatures;
    document.querySelector(".annotation-list-head").hidden = !options.hidden;
    els.annotationList.hidden = !options.hidden;
    if (options.hidden) return;
    document.getElementById("stamp-gallery-panel").hidden = !showStamps;
    document.getElementById("signature-library-panel").hidden = !showSignatures;
    document.getElementById("insert-tool-title").textContent = showStamps ? "Stamps" : "Signature List";

    const gallery = document.getElementById("stamp-gallery");
    if (showStamps) {
      gallery.replaceChildren();
      [...builtInStamps, ...customStamps].forEach((stamp) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stamp-card";
        button.classList.toggle("is-active", activeStamp?.label === stamp.label);
        button.setAttribute("aria-label", `Place ${stamp.label} stamp`);
        const preview = document.createElement("span");
        preview.className = "stamp-preview";
        preview.textContent = stamp.label;
        preview.style.color = stamp.color || "#b42318";
        preview.style.borderColor = stamp.color || "#b42318";
        preview.style.backgroundColor = stamp.fill || "transparent";
        button.append(preview);
        button.addEventListener("click", () => {
          activeStamp = stamp;
          setTool("stamp-place");
        });
        gallery.append(button);
      });
    }

    const signatureList = document.getElementById("signature-list");
    if (showSignatures) {
      signatureList.replaceChildren();
      if (!savedSignatures.length) {
        const empty = document.createElement("p");
        empty.className = "panel-muted signature-empty";
        empty.textContent = "No saved signatures";
        signatureList.append(empty);
      }
      savedSignatures.forEach((signature) => {
        const row = document.createElement("div");
        row.className = "signature-list-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "signature-card";
        button.classList.toggle("is-active", signature.id === activeSignatureId);
        button.setAttribute("aria-label", `Place signature ${signature.name}`);
        const image = document.createElement("img");
        image.src = signature.dataUrl;
        image.alt = signature.name;
        button.append(image);
        button.addEventListener("click", () => {
          activeSignatureId = signature.id;
          setTool("signature-place");
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-btn signature-card-remove";
        remove.setAttribute("aria-label", `Delete signature ${signature.name}`);
        remove.title = "Delete signature";
        remove.innerHTML = icon("trash");
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          const index = savedSignatures.findIndex((item) => item.id === signature.id);
          if (index >= 0) savedSignatures.splice(index, 1);
          if (activeSignatureId === signature.id) activeSignatureId = null;
          renderInsertToolOptions();
        });
        row.append(button, remove);
        signatureList.append(row);
      });
    }
  }

  function renderAnnotationPalette() {
    const palette = document.getElementById("annotation-color-palette");
    const selectedColor = document.getElementById("annotation-tool-color").value.toLowerCase();
    palette.querySelectorAll("[data-extra-annotation-color]").forEach((button) => button.remove());
    extraAnnotationColors.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "annotation-color-swatch";
      button.dataset.annotationPreset = color;
      button.dataset.extraAnnotationColor = "true";
      button.style.setProperty("--swatch-color", color);
      button.setAttribute("aria-label", `Color ${color}`);
      button.title = color;
      palette.append(button);
    });
    palette.querySelectorAll("[data-annotation-preset]").forEach((button) => {
      const color = button.dataset.annotationPreset.toLowerCase();
      button.style.setProperty("--swatch-color", color);
      button.classList.toggle("is-active", color === selectedColor);
    });
    palette.querySelectorAll("[data-custom-annotation-color]").forEach((button) => button.remove());
    customAnnotationColors.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "annotation-color-swatch";
      button.dataset.customAnnotationColor = color;
      button.style.setProperty("--swatch-color", color);
      button.classList.toggle("is-active", color.toLowerCase() === selectedColor);
      button.setAttribute("aria-label", `Custom color ${index + 1}`);
      button.title = color;
      palette.append(button);
    });
    document.getElementById("annotation-remove-color").disabled = !customAnnotationColors.length;
  }

  function renderAnnotationToolOptions() {
    const context = annotationToolContext();
    const options = document.getElementById("annotation-tool-options");
    options.hidden = !context;
    if (!context) return;
    const { tool, selected } = context;
    const defaults = annotationToolStyle(tool);
    const color = selected?.color || defaults.color;
    const opacity = selected?.opacity ?? defaults.opacity;
    const width = selected?.strokeWidth ?? selected?.width ?? defaults.width;
    document.getElementById("annotation-tool-title").textContent = annotationToolNames[tool];
    document.getElementById("annotation-tool-color").value = color;
    document.getElementById("annotation-opacity").value = String(Math.round(opacity * 100));
    document.getElementById("annotation-opacity-value").value = `${Math.round(opacity * 100)}%`;
    document.getElementById("annotation-opacity-wrap").hidden = false;
    document.getElementById("annotation-width-wrap").hidden = tool !== "draw" && tool !== "text";
    document.getElementById("annotation-tool-width").min = tool === "text" ? "0" : "1";
    document.getElementById("annotation-tool-width").value = String(Math.max(tool === "text" ? 0 : 1, Math.min(20, Math.round(width))));
    document.getElementById("annotation-width-value").value = `${Math.round(width)} pt`;
    els.annotationColor.value = color;
    renderAnnotationPalette();
  }

  function rangesForTarget(pageId, textTargetId) {
    const page = state.pages.find((item) => item.id === pageId);
    return (page?.formattingRanges || [])
      .filter((range) => range.textTargetId === textTargetId)
      .map(({ start, end, style }) => ({ start, end, style }));
  }

  function textOffsetPoint(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let last = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      last = node;
      if (remaining <= node.textContent.length) return { node, offset: remaining };
      remaining -= node.textContent.length;
    }
    return last ? { node: last, offset: last.textContent.length } : null;
  }

  function renderFormattedText(root, text, ranges, scale, preserveSelection = false) {
    const canRestoreSelection = preserveSelection &&
      !document.activeElement?.closest?.("#pdf-text-range-controls");
    const selection = canRestoreSelection ? window.getSelection() : null;
    const anchorInside = selection?.anchorNode &&
      (root.contains(selection.anchorNode) || root === selection.anchorNode);
    const focusInside = selection?.focusNode &&
      (root.contains(selection.focusNode) || root === selection.focusNode);
    const anchorOffset = Number.isInteger(preserveSelection?.start) && canRestoreSelection
      ? preserveSelection.start
      : anchorInside
        ? rangeOffset(root, selection.anchorNode, selection.anchorOffset)
        : null;
    const focusOffset = Number.isInteger(preserveSelection?.end) && canRestoreSelection
      ? preserveSelection.end
      : focusInside
        ? rangeOffset(root, selection.focusNode, selection.focusOffset)
        : null;
    const fragment = document.createDocumentFragment();
    for (const segment of formattingTextSegments(text, ranges)) {
      if (!segment.style) {
        fragment.append(document.createTextNode(segment.text));
        continue;
      }
      const span = document.createElement("span");
      const { fontFamily, fontSize, bold, italic, color } = segment.style;
      if (fontFamily) span.style.fontFamily = editorFontFamily(fontFamily);
      if (fontSize) span.style.fontSize = `${fontSize * scale}px`;
      if (bold != null) span.style.fontWeight = bold ? "bold" : "normal";
      if (italic != null) span.style.fontStyle = italic ? "italic" : "normal";
      if (color) span.style.color = color;
      span.textContent = segment.text;
      fragment.append(span);
    }
    root.replaceChildren(fragment);
    if (anchorOffset == null || focusOffset == null || !selection?.setBaseAndExtent) return;
    const anchor = textOffsetPoint(root, anchorOffset);
    const focus = textOffsetPoint(root, focusOffset);
    if (anchor && focus) {
      selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    }
  }

  function formattingSource(selection) {
    const page = state.pages.find((item) => item.id === selection.pageId);
    return state.textSelection?.textTargetId === selection.textTargetId
      ? state.textSelection
      : page?.annotations?.find(
          (item) => item.type === "text-edit" && item.sourceTextId === selection.textTargetId
        ) || null;
  }

  function activeFormattingRange() {
    const range = state.textRangeSelection;
    if (
      state.editorMode !== "edit" ||
      state.annotationTool !== "select" ||
      !range?.textTargetId ||
      !validateTextRange(range.text, range)
    ) return null;
    const page = state.pages.find((item) => item.id === range.pageId);
    if (!page) return null;
    const edit = page.annotations?.find(
      (item) => item.type === "text-edit" && item.sourceTextId === range.textTargetId
    );
    const currentText = edit ? edit.text : range.text;
    return currentText === range.text ? range : null;
  }

  function rangeOffset(root, node, offset) {
    if (!root.contains(node) && root !== node) return null;
    const before = document.createRange();
    before.selectNodeContents(root);
    try {
      before.setEnd(node, offset);
      return before.toString().length;
    } catch {
      return null;
    }
  }

  function textRangeFromSelection(root, textTargetId, text, pageId, annotationId = null) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !textTargetId || root.textContent !== text) return null;
    const domRange = selection.getRangeAt(0);
    const startOffset = rangeOffset(root, domRange.startContainer, domRange.startOffset);
    const endOffset = rangeOffset(root, domRange.endContainer, domRange.endOffset);
    if (startOffset == null || endOffset == null) return null;
    const start = Math.min(startOffset, endOffset);
    const end = Math.max(startOffset, endOffset);
    const result = { pageId, textTargetId, text, start, end };
    if (annotationId) result.annotationId = annotationId;
    return validateTextRange(text, result) &&
      text.slice(start, end) === selection.toString()
      ? result
      : null;
  }

  function captureInlineTextRange() {
    if (document.activeElement?.closest?.("#pdf-text-range-controls")) return;
    if (state.editorMode !== "edit" || state.annotationTool !== "select") return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const root = anchor instanceof Element
      ? anchor.closest(".annotation-inline-edit-text")
      : anchor?.parentElement?.closest(".annotation-inline-edit-text");
    if (!root || !root.isContentEditable) return;
    const mark = root.closest(".annotation-inline-edit");
    const pageId = mark?.closest(".vpage")?.dataset.id;
    const page = state.pages.find((item) => item.id === pageId);
    const annotation = page?.annotations?.find(
      (item) => item.id === mark?.dataset.annotationId && item.type === "text-edit"
    );
    if (!page || !annotation?.sourceTextId) return;
    const textRange = textRangeFromSelection(
      root,
      annotation.sourceTextId,
      root.textContent || "",
      page.id,
      annotation.id
    );
    if (textRange) state.textRangeSelection = textRange;
    else if (!selection?.isCollapsed) state.textRangeSelection = null;
    renderInspector();
  }
  document.addEventListener("selectionchange", captureInlineTextRange);

  function renderInspector() {
    const selection = state.textSelection;
    const annotation = activeAnnotation();
    const hasText = selection?.kind === "text";
    const editingInline = annotation?.type === "text-edit";
    const pdfText = hasText ? selection : editingInline ? annotation : null;
    const pdfTextProperties = document.getElementById("pdf-text-properties");
    pdfTextProperties.hidden = state.editorMode !== "edit" || !pdfText;
    if (pdfText) {
      document.getElementById("pdf-text-original").textContent =
        pdfText.originalText || pdfText.text || "";
      document.getElementById("pdf-text-current").textContent = pdfText.text || "";
      document.getElementById("pdf-text-font-family").textContent =
        pdfText.sourceFontFamily || "Unavailable";
      document.getElementById("pdf-text-font-size").textContent =
        Number.isFinite(pdfText.fontSize)
          ? `${pdfText.fontSize.toFixed(1)} pt (approx.)`
          : "Unavailable";
      document.getElementById("pdf-text-bold").textContent =
        pdfText.sourceBold === true
          ? "Detected"
          : pdfText.sourceBold === false
            ? "Not detected"
            : "Unavailable";
      document.getElementById("pdf-text-italic").textContent =
        pdfText.sourceItalic === true
          ? "Detected"
          : pdfText.sourceItalic === false
            ? "Not detected"
            : "Unavailable";
      document.getElementById("pdf-text-color").textContent =
        pdfText.sourceTextColor || "Unavailable";
    }
    const rangeSelection = activeFormattingRange();
    const rangeControls = document.getElementById("pdf-text-range-controls");
    rangeControls.hidden = !rangeSelection || state.editorMode !== "edit";
    if (rangeSelection) {
      const ranges = rangesForTarget(rangeSelection.pageId, rangeSelection.textTargetId);
      const style = styleForTextRange(ranges, rangeSelection.start, rangeSelection.end);
      const source = formattingSource(rangeSelection);
      document.getElementById("pdf-range-font-family").value =
        style.fontFamily || source?.fontFamily || "Helvetica";
      document.getElementById("pdf-range-font-size").value =
        String(Math.round(style.fontSize || source?.fontSize || 12));
      document.getElementById("pdf-range-bold").setAttribute(
        "aria-pressed",
        String(style.bold ?? (source?.sourceBold === true || source?.fontWeight === "bold"))
      );
      document.getElementById("pdf-range-italic").setAttribute(
        "aria-pressed",
        String(style.italic ?? (source?.sourceItalic === true || source?.fontStyle === "italic"))
      );
      document.getElementById("pdf-range-color").value =
        colorInputValue(style.color || source?.sourceTextColor);
      document.getElementById("pdf-range-selection-text").textContent =
        rangeSelection.text.slice(rangeSelection.start, rangeSelection.end);
    }
    document.body.classList.toggle("has-text-inspector", Boolean(selection));
    els.textInspector.hidden = !selection;
    els.selectedText.value = hasText ? selection.text : annotation?.text || "";
    els.selectedText.readOnly = editingInline;
    els.applyText.disabled = editingInline || (!hasText && annotation?.type !== "text");
    els.applyText.hidden = editingInline;
    els.applyText.textContent = editingInline
      ? "Editing on the page"
      : hasText
      ? "Edit PDF text in place"
        : "Apply overlay text";
    els.clearTextSelection.disabled = !selection;
    renderAnnotationList();
    const selectedText = annotation?.type === "text";
    const textToolActive = state.annotationTool === "text";
    const editableText = selectedText || textToolActive;
    const textValues = selectedText ? annotation : textInsertDefaults;
    document.querySelector(".text-style-editor").hidden = !editableText;
    [els.textFont, els.textSize, els.textColor, els.customTextColor].forEach((control) => {
      control.disabled = !editableText;
    });
    els.textLink.disabled = !selectedText;
    els.textLink.classList.toggle("is-active", Boolean(annotation?.link));
    if (!selectedText) {
      els.textLinkEditor.hidden = true;
      els.textUrl.value = "";
    }
    document.querySelectorAll("[data-text-format], [data-text-align], [data-text-valign]").forEach((button) => {
      button.disabled = !editableText;
      const key = button.dataset.textFormat;
      const active = key === "bold"
        ? textValues.fontWeight === "bold"
        : key === "italic"
          ? textValues.fontStyle === "italic"
          : key === "underline"
            ? Boolean(textValues.underline)
            : key === "strike"
              ? Boolean(textValues.strike)
              : button.dataset.textAlign
                ? textValues.align === button.dataset.textAlign
                : button.dataset.textValign
                  ? textValues.verticalAlign === button.dataset.textValign
                : false;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    els.textFont.value = textValues.fontFamily || "Helvetica";
    els.textSize.value = String(textValues.fontSize || 12);
    els.textColor.value = textValues.color || "#171717";
    document.getElementById("text-auto-fit").checked = Boolean(textValues.autoFit);
    document.querySelectorAll("[data-text-format], [data-text-align], [data-text-valign]").forEach((button) => {
      button.disabled = !editableText;
    });
    if (selectedText) els.textUrl.value = annotation.link || "";
    renderFormToolOptions();
    renderAnnotationToolOptions();
    renderShapeToolOptions();
    renderInsertToolOptions();
    renderTextOptions();
  }

  let formFieldDraft = null;
  let formDraftKey = "";

  function formDraftSource() {
    const tool = state.annotationTool;
    if (tool?.startsWith("form-") && formToolDefaults[tool]) {
      return { mode: "defaults", tool };
    }
    const annotation = activeAnnotation();
    const page = currentPage();
    if (annotation?.type === "formField" && page) {
      return { mode: "field", tool: `form-${annotation.fieldType}`, annotation, page };
    }
    return null;
  }

  function buildFormDraft(source) {
    if (source.mode === "defaults") {
      const defaults = formToolDefaults[source.tool];
      return {
        value: defaults.value || "",
        readOnly: Boolean(defaults.readOnly),
        required: Boolean(defaults.required),
        multiline: Boolean(defaults.multiline),
        multiSelect: Boolean(defaults.multiSelect),
        indicator: Boolean(defaults.indicator),
        width: defaults.width,
        height: defaults.height,
        options: [...(defaults.options || [])],
      };
    }
    const { annotation, page } = source;
    return {
      value: annotation.defaultValue || "",
      readOnly: Boolean(annotation.readOnly),
      required: Boolean(annotation.required),
      multiline: Boolean(annotation.multiline),
      multiSelect: Boolean(annotation.multiSelect),
      indicator: Boolean(annotation.indicator),
      width: Math.max(10, Math.round(annotation.w * page.width)),
      height: Math.max(10, Math.round(annotation.h * page.height)),
      options: [...(annotation.options || [])],
    };
  }

  function formDraftIdentity(source) {
    return source ? `${source.mode}:${source.tool}:${source.annotation?.id || ""}` : "";
  }

  function syncFormDraftToDefaults() {
    const source = formDraftSource();
    if (source?.mode !== "defaults" || !formFieldDraft) return;
    const defaults = formToolDefaults[source.tool];
    if (!defaults) return;
    for (const key of [
      "value",
      "readOnly",
      "required",
      "multiline",
      "multiSelect",
      "indicator",
      "width",
      "height",
      "options",
    ]) {
      if (!(key in defaults)) continue;
      defaults[key] = key === "options" ? [...formFieldDraft.options] : formFieldDraft[key];
    }
  }

  function renderFormToolOptions() {
    const source = formDraftSource();
    els.formToolOptions.hidden = !source;
    if (!source) {
      formFieldDraft = null;
      formDraftKey = "";
      return;
    }
    if (!formFieldDraft || formDraftKey !== formDraftIdentity(source)) {
      formDraftKey = formDraftIdentity(source);
      formFieldDraft = buildFormDraft(source);
    }
    const values = formFieldDraft;
    const tool = source.tool;
    document.getElementById("form-tool-title").textContent = `${formToolLabels[tool]} Field Tool`;
    document.getElementById("form-tool-context").textContent = source.mode === "field"
      ? "Editing the selected field. Click Save changes to apply them."
      : "Defaults for the next field you place.";
    const valueWrap = document.getElementById("form-default-value-wrap");
    valueWrap.hidden = tool !== "form-text";
    document.getElementById("form-default-value").value = values.value || "";
    const availableProperties = new Set(
      ["readOnly", "required", "multiline", "multiSelect", "indicator"]
        .filter((property) => property in formToolDefaults[tool])
    );
    document.querySelectorAll("[data-form-setting]").forEach((row) => {
      const property = row.dataset.formSetting;
      row.hidden = !availableProperties.has(property);
      const input = row.querySelector("input");
      input.checked = Boolean(values[property]);
    });
    const dimensions = document.getElementById("form-field-dimensions");
    dimensions.hidden = tool === "form-label";
    document.getElementById("form-field-width").value = String(values.width);
    document.getElementById("form-field-height").value = String(values.height);
    const optionsEditor = document.getElementById("form-options-editor");
    optionsEditor.hidden = tool !== "form-dropdown" && tool !== "form-list";
    const list = document.getElementById("form-option-list");
    list.replaceChildren();
    if (optionsEditor.hidden) return;
    values.options.forEach((option, index) => {
      const row = document.createElement("li");
      row.className = "form-option-row";
      const input = document.createElement("input");
      input.className = "input";
      input.type = "text";
      input.value = option;
      input.setAttribute("aria-label", `Choice option ${index + 1}`);
      input.addEventListener("change", () => {
        values.options[index] = input.value.trim() || `Option ${index + 1}`;
        syncFormDraftToDefaults();
      });
      const up = document.createElement("button");
      up.type = "button";
      up.className = "icon-btn";
      up.setAttribute("aria-label", `Move option ${index + 1} up`);
      up.textContent = "↑";
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        [values.options[index - 1], values.options[index]] =
          [values.options[index], values.options[index - 1]];
        syncFormDraftToDefaults();
        renderFormToolOptions();
      });
      const down = document.createElement("button");
      down.type = "button";
      down.className = "icon-btn";
      down.setAttribute("aria-label", `Move option ${index + 1} down`);
      down.textContent = "↓";
      down.disabled = index === values.options.length - 1;
      down.addEventListener("click", () => {
        [values.options[index + 1], values.options[index]] =
          [values.options[index], values.options[index + 1]];
        syncFormDraftToDefaults();
        renderFormToolOptions();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.setAttribute("aria-label", `Remove option ${index + 1}`);
      remove.innerHTML = icon("trash");
      remove.addEventListener("click", () => {
        values.options.splice(index, 1);
        syncFormDraftToDefaults();
        renderFormToolOptions();
      });
      row.append(input, up, down, remove);
      list.append(row);
    });
  }

  function renderAnnotationList() {
    const page = state.pages.find((item) => item.id === state.currentId) || state.pages[0];
    const formToolActive =
      state.annotationTool === "signature" || state.annotationTool.startsWith("form-");
    const formEntries = (page?.annotations || []).filter((annotation) =>
      annotation.type === "formField" ||
      annotation.formLabel ||
      (annotation.type === "draw" && annotation.signature)
    );
    els.annotationPageLabel.textContent = formToolActive
      ? `Form Field List (${formEntries.length})`
      : page
        ? `Page ${state.pages.indexOf(page) + 1}`
        : "No page";
    els.annotationList.setAttribute(
      "aria-label",
      formToolActive ? "Form field list" : "Page annotations"
    );
    els.removeAllAnnotations.hidden = formToolActive;
    const removableAnnotations = (page?.annotations || []).filter(
      (annotation) => !isTextMarkAnnotation(annotation)
    );
    els.removeAllAnnotations.disabled = formToolActive
      ? !formEntries.length
      : !removableAnnotations.length;
    if (!page) {
      els.annotationList.replaceChildren();
      return;
    }
    const entries = [...(formToolActive ? formEntries : page.annotations || [])].reverse();
    const fragment = document.createDocumentFragment();
    entries.forEach((annotation, visualIndex) => {
      const textMark = isTextMarkAnnotation(annotation);
      const item = document.createElement("li");
      item.className = "annotation-list-item";
      item.classList.toggle(
        "is-selected",
        !textMark && state.textSelection?.annotationId === annotation.id
      );
      const move = document.createElement("button");
      move.type = "button";
      move.className = "icon-btn layer-move";
      move.setAttribute("aria-label", `Move ${annotationName(annotation)} ${visualIndex ? "up" : "down"}`);
      move.title = visualIndex ? "Move in front" : "Move behind";
      move.innerHTML = `<span aria-hidden="true">${visualIndex ? "↕" : "↕"}</span>`;
      move.disabled = textMark || entries.length < 2;
      move.addEventListener("click", (event) => {
        event.stopPropagation();
        const index = page.annotations.findIndex((entry) => entry.id === annotation.id);
        const adjacentEntry = entries[visualIndex === 0 ? 1 : visualIndex - 1];
        if (!adjacentEntry) return;
        const target = page.annotations.findIndex((entry) => entry.id === adjacentEntry.id);
        if (target < 0 || target >= page.annotations.length) return;
        commit(() => {
          [page.annotations[index], page.annotations[target]] = [page.annotations[target], page.annotations[index]];
        });
        renderInspector();
      });
      const iconNode = document.createElement("span");
      iconNode.className = "annotation-list-icon";
      const listIcon = annotation.type === "image"
        ? annotation.signature ? "signature" : "image"
        : annotation.type === "shape"
          ? annotation.shape === "ellipse" ? "circle" : annotation.shape === "line" ? "minus" : "square"
          : annotation.type === "formField"
            ? {
                text: "text-field",
                checkbox: "checkbox",
                radio: "radio",
                dropdown: "chevron-down",
                list: "list",
              }[annotation.fieldType] || "form"
            : annotation.type === "draw" && annotation.signature
              ? "signature"
              : annotation.formLabel
                ? "type"
                : null;
      iconNode.innerHTML = listIcon ? icon(listIcon) : '<span aria-hidden="true">T</span>';
      const label = document.createElement("button");
      label.type = "button";
      label.className = "annotation-list-label";
      label.textContent = annotationName(annotation);
      label.disabled = textMark;
      label.addEventListener("click", () => {
        if (textMark) return;
        state.currentId = page.id;
        state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
        if (annotation.type === "formField") renderInspector();
        else setTool("select");
        render();
      });
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "icon-btn";
      edit.setAttribute("aria-label", `Select ${annotationName(annotation)}`);
      edit.innerHTML = icon("pen");
      edit.disabled = textMark;
      edit.addEventListener("click", () => {
        if (textMark) return;
        state.currentId = page.id;
        state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
        if (annotation.type === "formField") renderInspector();
        else setTool("select");
        render();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.setAttribute("aria-label", `Remove ${annotationName(annotation)}`);
      remove.innerHTML = icon("trash");
      remove.hidden = textMark;
      remove.addEventListener("click", () => eraseAnnotation(page, annotation.id));
      item.append(move, iconNode, label, edit, remove);
      item.addEventListener("click", () => {
        if (textMark) return;
        state.currentId = page.id;
        state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
        renderInspector();
      });
      fragment.append(item);
    });
    els.annotationList.replaceChildren(fragment);
  }

  function annotationName(annotation) {
    if (annotation.type === "text" || annotation.type === "text-edit") {
      return annotation.text?.trim().slice(0, 34) || "Text";
    }
    if (annotation.type === "image") return annotation.signature ? "Signature" : "Image";
    if (annotation.type === "shape") {
      return {
        rect: "Rectangle",
        ellipse: "Circle",
        arc: "Arc",
        pentagon: "Pentagon",
        cloud: "Cloud",
        line: "Line",
        polyline: "Polyline",
        arrow: "Arrow",
        smiley: "Smiley",
      }[annotation.shape] || "Shape";
    }
    if (annotation.type === "attachment") return annotation.name || "Attachment";
    if (annotation.type === "formField") {
      return {
        signature: "Signature field",
        text: "Text field",
        checkbox: "Checkbox",
        radio: "Radio button",
        dropdown: "Dropdown",
        list: "List box",
      }[annotation.fieldType] || "Form field";
    }
    return annotation.type === "draw"
      ? annotation.signature
        ? "Signature"
        : {
            "annotate-underline": "Underline",
            "annotate-squiggle": "Squiggly underline",
            "annotate-strike": "Strikethrough",
          }[annotation.tool] || "Freehand drawing"
      : "Highlight";
  }

  function setTool(tool) {
    if (tool === "paragraph") tool = "text";
    const selectedAnnotation = activeAnnotation();
    if (isTextMarkAnnotation(selectedAnnotation)) state.textSelection = null;
    if (tool !== "select") state.textRangeSelection = null;
    state.annotationTool = tool;
    document.body.dataset.annotationTool = tool;
    if (tool !== "text") closeTextOptions();
    const toolButton = document.querySelector(
      `.annotation-tool-btn[data-annotation-tool="${tool}"], [data-edit-tool="${tool}"]`
    );
    const toolIcon = toolButton?.querySelector("svg");
    if (tool !== "text" && tool !== "select" && tool !== "none" && toolIcon) {
      const cursorSvg = tool === "form-label"
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3"/></svg>'
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${toolIcon.innerHTML}</svg>`;
      const hotspot = tool === "select" ? "4 4" : tool === "eraser" ? "4 16" : tool === "form-label" ? "12 12" : "4 20";
      document.body.style.setProperty(
        "--annotation-cursor",
        `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") ${hotspot}`
      );
    } else {
      document.body.style.removeProperty("--annotation-cursor");
    }
    document.querySelectorAll("[data-annotation-tool], [data-edit-tool]").forEach((button) => {
      const active = button.dataset.annotationTool === tool || button.dataset.editTool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderFormToolOptions();
    renderAnnotationToolOptions();
    renderShapeToolOptions();
    renderInsertToolOptions();
    const shapeActive = tool.startsWith("shape-");
    const shapeToggle = document.getElementById("shape-menu-toggle");
    shapeToggle.classList.toggle("is-active", shapeActive);
    shapeToggle.setAttribute("aria-pressed", String(shapeActive));
    els.pages.querySelectorAll(".annotation-text-input").forEach((input) => {
      input.contentEditable = String(
        tool === "text" ||
          ((tool === "select" || tool === "text") &&
            (input.dataset.cellText === "true" ||
              input.dataset.directEdit === "true" ||
              state.textSelection?.annotationId === input.closest("[data-annotation-id]")?.dataset.annotationId)) ||
          (textMarkupTools.has(tool) &&
            state.textSelection?.annotationId === input.closest("[data-annotation-id]")?.dataset.annotationId)
      );
    });
    els.pages.querySelectorAll(".annotation-inline-edit-text").forEach((input) => {
      input.contentEditable = String(
        (tool === "select" && document.activeElement === input) ||
          (textMarkupTools.has(tool) &&
            state.textSelection?.annotationId === input.closest("[data-annotation-id]")?.dataset.annotationId)
      );
    });
    renderAnnotationList();
    els.annotationHint.textContent =
      tool === "none"
        ? "No tool selected. Choose a tool to edit or annotate the page."
        : tool === "eraser"
          ? "Click an annotation to erase it."
          : tool === "select"
            ? "Dashed outlines show detected PDF text. Click a run to edit it; select words in the inline editor. Drag here to select; Alt-drag moves the complete run."
            : tool === "drag"
              ? "Drag the page to move around it, or drag an element to move it."
            : tool === "draw"
              ? "Draw a freehand mark on the page."
              : tool === "signature"
                ? "Draw your signature on the page."
                  : tool === "stamp-gallery"
                    ? "Choose a stamp from the gallery."
                  : tool === "stamp-place"
                    ? `Click on the page to place ${activeStamp?.label || "the selected stamp"}.`
                  : tool === "signature-library"
                    ? "Choose a saved signature or create a new one."
                  : tool === "signature-place"
                    ? "Click on the page to place the selected signature."
                : tool === "comment"
                  ? "Click on the page to add a comment."
                : tool === "annotate-underline" || tool === "annotate-squiggle" || tool === "annotate-strike"
                  ? "Drag across the page to mark text."
                : tool.startsWith("form-")
                  ? tool === "form-label"
                    ? "Click on the page to insert free text; select it later to move or resize."
                      : `Drag on the page to place a ${
                        {
                          signature: "signature",
                          text: "text",
                          checkbox: "checkbox",
                          radio: "radio button",
                          dropdown: "dropdown",
                          list: "list box",
                        }[tool.slice("form-".length)] || "form"
                      } field.`
              : tool === "attachment"
                ? "Choose a file to attach to the PDF."
              : tool.startsWith("shape-")
                ? `Drag on the page to draw a ${tool.slice("shape-".length)}.`
                : tool === "image"
                  ? "Choose a PNG or JPEG image to place on the page."
              : tool === "text"
                ? "Click a blank area to add text. Click an existing text box to edit it, or drag any element to move or resize it."
                : tool === "highlight"
                  ? "Drag over a page to highlight an area."
                  : "Choose a tool to edit or annotate the page.";
            renderInspector();
  }

  const formValueInput = document.getElementById("form-default-value");
  formValueInput.addEventListener("input", () => {
    if (!formFieldDraft) return;
    formFieldDraft.value = formValueInput.value;
    syncFormDraftToDefaults();
  });
  document.querySelectorAll("[data-form-property]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!formFieldDraft) return;
      formFieldDraft[input.dataset.formProperty] = input.checked;
      syncFormDraftToDefaults();
    });
  });
  for (const dimension of ["width", "height"]) {
    document.getElementById(`form-field-${dimension}`).addEventListener("change", (event) => {
      if (!formFieldDraft) return;
      const value = Number(event.currentTarget.value);
      if (!Number.isFinite(value) || value < 10 || value > 1000) {
        event.currentTarget.value = String(formFieldDraft[dimension]);
        return;
      }
      formFieldDraft[dimension] = value;
      syncFormDraftToDefaults();
    });
  }
  document.getElementById("form-add-option").addEventListener("click", () => {
    if (!formFieldDraft?.options) return;
    formFieldDraft.options.push(`Option ${++formOptionCounter}`);
    syncFormDraftToDefaults();
    renderFormToolOptions();
  });
  document.getElementById("form-tool-close").addEventListener("click", () => {
    if (formDraftSource()?.mode === "field") {
      state.textSelection = null;
      formFieldDraft = null;
      formDraftKey = "";
      renderInspector();
      render();
      return;
    }
    setTool("select");
  });
  document.getElementById("form-tool-save").addEventListener("click", () => {
    const source = formDraftSource();
    if (!source || !formFieldDraft) return;
    if (source.mode === "defaults") {
      syncFormDraftToDefaults();
      toast(`${formToolLabels[source.tool]} defaults saved for the next field you place.`);
      return;
    }
    const { annotation, page } = source;
    const values = formFieldDraft;
    const squareField = annotation.fieldType === "checkbox" || annotation.fieldType === "radio";
    const width = Math.max(0.008, Math.min(0.95, values.width / page.width));
    const height = squareField
      ? width
      : Math.max(0.008, Math.min(0.95, values.height / page.height));
    const patch = {
      defaultValue: values.value,
      readOnly: values.readOnly,
      required: values.required,
      indicator: values.indicator,
      options: [...values.options],
      w: width,
      h: height,
    };
    if (annotation.fieldType === "text") patch.multiline = values.multiline;
    if (annotation.fieldType === "list") patch.multiSelect = values.multiSelect;
    updateAnnotation(annotation, patch);
    toast(`${formToolLabels[source.tool]} changes saved.`);
  });

  function normalizedPoint(event, layer, page) {
    const rect = layer.getBoundingClientRect();
    return screenToBaseline(
      {
        x: clamp((event.clientX - rect.left) / rect.width),
        y: clamp((event.clientY - rect.top) / rect.height),
      },
      page.rotation
    );
  }

  function addAnnotation(page, annotation) {
    commit(() => {
      page.annotations = [...(page.annotations || []), annotation];
      state.textSelection =
        annotation.type === "highlight"
          ? null
          : { pageId: page.id, kind: "annotation", annotationId: annotation.id };
    });
    renderInspector();
  }

  function textOffsetsInRange(range, element) {
    if (!range.intersectsNode(element)) return null;
    const content = element.matches(".pdf-text-item, .annotation-text-input, .annotation-inline-edit-text")
      ? element
      : element.querySelector(".annotation-inline-edit-text, .annotation-text-input");
    if (!content) return null;
    const prefixLength = (container, offset) => {
      if (container !== content && !content.contains(container)) return null;
      const prefix = document.createRange();
      prefix.selectNodeContents(content);
      prefix.setEnd(container, offset);
      return prefix.toString().length;
    };
    const length = content.textContent?.length || 0;
    const start = prefixLength(range.startContainer, range.startOffset) ?? 0;
    const end = prefixLength(range.endContainer, range.endOffset) ?? length;
    return end > start ? { content, start, end } : null;
  }

  function rangeForTextOffsets(content, start, end) {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let total = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const length = node.textContent?.length || 0;
      nodes.push({ node, start: total, end: total + length });
      total += length;
    }
    if (start >= end || start >= total) return null;
    const first = nodes.find((item) => start < item.end);
    const last = [...nodes].reverse().find((item) => end > item.start);
    if (!first || !last) return null;
    const result = document.createRange();
    result.setStart(first.node, Math.max(0, start - first.start));
    result.setEnd(last.node, Math.min(last.end - last.start, end - last.start));
    return result;
  }

  function createTextMarkup(tool, segments, textTarget = null, textRange = null) {
    if (!segments.length) return null;
    const style = annotationToolStyle(tool);
    const box = segments[0];
    return {
      id: crypto.randomUUID(),
      type: tool === "highlight" ? "highlight" : "draw",
      ...(tool === "highlight" ? {} : { tool }),
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      color: style.color,
      opacity: style.opacity,
      textMark: true,
      segments,
      ...(tool === "highlight"
        ? {}
        : { width: style.width / Math.max(state.zoom, 0.25) }),
      ...(textTarget ? { textTarget, textRange } : {}),
    };
  }

  function addTextMarkupFromRange(page, range, container, targets, tool) {
    const annotations = [];
    const candidates = targets.filter((target) => {
      const content = target.matches(".pdf-text-item")
        ? target
        : target.querySelector(".annotation-inline-edit-text, .annotation-text-input");
      return content && range.intersectsNode(content);
    });
    let anchored = 0;
    for (const target of candidates) {
      const offsets = textOffsetsInRange(range, target);
      if (!offsets) continue;
      const selectedRange = rangeForTextOffsets(offsets.content, offsets.start, offsets.end);
      const segments = [...(selectedRange?.getClientRects() || [])]
        .map((rect) => selectionRectToBaselineBox(rect, container, page))
        .filter(Boolean);
      const targetId = target.dataset.textTargetId;
      const targetKind = target.dataset.textTargetKind;
      if (!segments.length || !targetId || !["pdf", "annotation"].includes(targetKind)) continue;
      annotations.push(createTextMarkup(
        tool,
        segments,
        { kind: targetKind, id: targetId },
        { start: offsets.start, end: offsets.end }
      ));
    }

    if (!annotations.length) {
      const fallbackSegments = [...range.getClientRects()]
        .map((rect) => selectionRectToBaselineBox(rect, container, page))
        .filter(Boolean);
      const fallback = createTextMarkup(tool, fallbackSegments);
      if (fallback) annotations.push(fallback);
      if (fallbackSegments.length) {
      toast("This text selection could not be linked to a text element; the mark will stay in place if the text changes.", {
        type: "error",
      });
      }
    }
    if (!annotations.length) return;
    commit(() => {
      page.annotations = [...(page.annotations || []), ...annotations];
      state.textSelection = null;
    });
    renderInspector();
  }

  function selectionRectToBaselineBox(rect, container, page) {
    const pageRect = container.getBoundingClientRect();
    if (!pageRect.width || !pageRect.height) return null;
    const corners = [
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.left, y: rect.bottom },
      { x: rect.right, y: rect.bottom },
    ].map((point) =>
      screenToBaseline(
        {
          x: clamp((point.x - pageRect.left) / pageRect.width),
          y: clamp((point.y - pageRect.top) / pageRect.height),
        },
        page.rotation
      )
    );
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      w: Math.max(0.001, Math.max(...xs) - x),
      h: Math.max(0.001, Math.max(...ys) - y),
    };
  }

  function beginCellText(page, cell, sourceItem) {
    const horizontalInset = Math.min(2 / page.width, cell.w * 0.08);
    const verticalInset = Math.min(1 / page.height, cell.h * 0.08);
    const annotation = {
      id: crypto.randomUUID(),
      type: "text",
      cellText: true,
      x: cell.x + horizontalInset,
      y: cell.y + verticalInset,
      w: Math.max(0.005, cell.w - horizontalInset * 2),
      h: Math.max(0.008, cell.h - verticalInset * 2),
      text: "",
      color: "#171717",
      fontSize: sourceItem?.fontSize || 9,
      fontFamily: resolveFontFamily(sourceItem?.fontStyle, sourceItem?.fontMetadata),
      fontWeight: sourceItem?.fontMetadata?.bold ? "bold" : "normal",
      fontStyle: sourceItem?.fontMetadata?.italic ? "italic" : "normal",
      weight: sourceItem?.fontMetadata?.bold ? "bold" : "normal",
      align: "left",
    };
    addAnnotation(page, annotation);
    requestAnimationFrame(() => focusEditable(annotation.id, "annotation-text-input"));
    toast("Type directly into the selected table cell.");
  }

  function addTextAtPoint(page, layer, point, directEdit = false, text = "Text", extra = {}) {
    const fontSize = textInsertDefaults.fontSize;
    const labelDefaults = extra.formLabel ? formToolDefaults["form-label"] : null;
    const boxWidth = labelDefaults
      ? Math.min(0.95, labelDefaults.width / page.width)
      : Math.min(0.4, 220 / layer.clientWidth);
    const boxHeight = labelDefaults
      ? Math.min(0.95, labelDefaults.height / page.height)
      : Math.max(0.035, (fontSize * 1.5) / layer.clientHeight);
    const annotation = {
      id: crypto.randomUUID(),
      type: "text",
      directEdit,
      ...extra,
      x: Math.min(point.x, 1 - boxWidth),
      y: Math.min(point.y, 1 - boxHeight),
      w: boxWidth,
      h: boxHeight,
      text,
      ...textInsertDefaults,
      ...(extra.formLabel ? { color: els.formFieldColor.value } : {}),
    };
    addAnnotation(page, annotation);
    requestAnimationFrame(() => focusEditable(annotation.id, "annotation-text-input"));
  }

  function addStamp(label, point = null, stampStyle = {}) {
    const page = state.pages.find((item) => item.id === state.currentId) || state.pages[0];
    if (!page) {
      toast("Open a PDF before inserting a stamp.", { type: "error" });
      return;
    }
    const width = 0.38;
    const height = 0.075;
    const x = point ? Math.max(0, Math.min(1 - width, point.x - width / 2)) : 0.2;
    const y = point ? Math.max(0, Math.min(1 - height, point.y - height / 2)) : 0.18;
    addAnnotation(page, {
      id: crypto.randomUUID(),
      type: "text",
      stamp: true,
      x,
      y,
      w: width,
      h: height,
      text: label,
      color: stampStyle.color || "#b42318",
      fill: stampStyle.fill || null,
      fontSize: 18,
      fontWeight: "bold",
      align: "center",
    });
    setTool("select");
  }

  function renderSignatureCanvas() {
    const canvas = document.getElementById("signature-canvas");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = signatureColor;
    context.lineWidth = 6;
    context.lineCap = "round";
    context.lineJoin = "round";
    signaturePaths.forEach((points) => {
      if (!points.length) return;
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    });
  }

  function signatureFontFamily() {
    return {
      cursive: '"Brush Script MT", "Segoe Script", cursive',
      serif: '"Times New Roman", Georgia, serif',
      "sans-serif": 'Arial, Helvetica, sans-serif',
    }[document.getElementById("signature-font").value] || "cursive";
  }

  function renderTypedSignaturePreview() {
    const preview = document.getElementById("signature-type-preview");
    preview.textContent = document.getElementById("signature-type-input").value || "";
    preview.style.fontFamily = signatureFontFamily();
    preview.style.color = signatureColor;
    preview.style.fontStyle = "italic";
  }

  function updateSignatureDialog() {
    document.querySelectorAll("[data-signature-mode]").forEach((button) => {
      const active = button.dataset.signatureMode === signatureMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    for (const mode of ["draw", "type", "upload"]) {
      document.getElementById(`signature-${mode}-panel`).hidden = mode !== signatureMode;
    }
    document.getElementById("signature-style-row").hidden = signatureMode === "upload";
    const ready = signatureMode === "draw"
      ? signaturePaths.some((points) => points.length > 1)
      : signatureMode === "type"
        ? Boolean(document.getElementById("signature-type-input").value.trim())
        : Boolean(signatureUpload);
    document.getElementById("signature-create").disabled = !ready;
    renderTypedSignaturePreview();
  }

  function openSignatureDialog() {
    signatureMode = "draw";
    signatureColor = "#171717";
    signaturePaths = [];
    signatureDrawing = null;
    signatureUpload = null;
    document.getElementById("signature-type-input").value = "";
    document.getElementById("signature-upload-preview").hidden = true;
    document.querySelectorAll("[data-signature-color]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.signatureColor === signatureColor);
    });
    renderSignatureCanvas();
    updateSignatureDialog();
    document.getElementById("signature-dialog").showModal();
  }

  function placeSavedSignature(point) {
    const signature = savedSignatures.find((item) => item.id === activeSignatureId);
    const page = state.pages.find((item) => item.id === state.currentId) || state.pages[0];
    if (!signature || !page) {
      toast("Choose a saved signature first.", { type: "error" });
      return;
    }
    const width = Math.min(0.32, 210 / page.width);
    const aspectRatio = signature.width / signature.height;
    const height = Math.min(0.16, width * page.width / page.height / aspectRatio);
    addAnnotation(page, {
      id: crypto.randomUUID(),
      type: "image",
      signature: true,
      name: signature.name,
      x: Math.max(0, Math.min(1 - width, point.x - width / 2)),
      y: Math.max(0, Math.min(1 - height, point.y - height / 2)),
      w: width,
      h: height,
      dataUrl: signature.dataUrl,
    });
    setTool("select");
  }

  function createTypedSignature() {
    const text = document.getElementById("signature-type-input").value.trim();
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 240;
    const context = canvas.getContext("2d");
    if (!context || !text) return null;
    let fontSize = 92;
    context.font = `italic ${fontSize}px ${signatureFontFamily()}`;
    const measured = context.measureText(text).width;
    if (measured > 680) fontSize *= 680 / measured;
    context.font = `italic ${fontSize}px ${signatureFontFamily()}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = signatureColor;
    context.fillText(text, 360, 120, 680);
    return { name: text, width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL("image/png") };
  }

  async function loadSignatureUpload(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      toast("Choose a PNG or JPEG signature up to 20 MB.", { type: "error" });
      return;
    }
    try {
      const [dataUrl, bitmap] = await Promise.all([
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error("Image could not be read."));
          reader.readAsDataURL(file);
        }),
        createImageBitmap(file),
      ]);
      signatureUpload = {
        name: file.name.replace(/\.[^.]+$/, "") || "Signature",
        width: bitmap.width,
        height: bitmap.height,
        dataUrl,
      };
      bitmap.close();
      const preview = document.getElementById("signature-upload-preview");
      preview.src = dataUrl;
      preview.hidden = false;
      updateSignatureDialog();
    } catch (error) {
      console.error("Signature upload failed", error);
      toast("Couldn't load that signature image.", { type: "error" });
    }
  }

  function saveSignature() {
    const signature = signatureMode === "draw"
      ? {
          name: "Signature",
          width: 720,
          height: 240,
          dataUrl: document.getElementById("signature-canvas").toDataURL("image/png"),
        }
      : signatureMode === "type"
        ? createTypedSignature()
        : signatureUpload;
    if (!signature) return;
    const saved = { id: crypto.randomUUID(), ...signature };
    savedSignatures.push(saved);
    activeSignatureId = saved.id;
    document.getElementById("signature-dialog").close();
    setTool("signature-place");
  }

  const signatureCanvas = document.getElementById("signature-canvas");
  signatureCanvas.addEventListener("pointerdown", (event) => {
    if (signatureMode !== "draw" || event.button !== 0) return;
    event.preventDefault();
    const rect = signatureCanvas.getBoundingClientRect();
    signatureDrawing = [];
    signaturePaths.push(signatureDrawing);
    signatureDrawing.push({
      x: ((event.clientX - rect.left) / rect.width) * signatureCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * signatureCanvas.height,
    });
    signatureCanvas.setPointerCapture(event.pointerId);
    renderSignatureCanvas();
    updateSignatureDialog();
  });
  signatureCanvas.addEventListener("pointermove", (event) => {
    if (!signatureDrawing) return;
    const rect = signatureCanvas.getBoundingClientRect();
    signatureDrawing.push({
      x: ((event.clientX - rect.left) / rect.width) * signatureCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * signatureCanvas.height,
    });
    renderSignatureCanvas();
  });
  const finishSignatureDrawing = () => {
    signatureDrawing = null;
    updateSignatureDialog();
  };
  signatureCanvas.addEventListener("pointerup", finishSignatureDrawing);
  signatureCanvas.addEventListener("pointercancel", finishSignatureDrawing);
  document.getElementById("signature-clear").addEventListener("click", () => {
    signaturePaths = [];
    renderSignatureCanvas();
    updateSignatureDialog();
  });
  document.querySelectorAll("[data-signature-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      signatureMode = button.dataset.signatureMode;
      updateSignatureDialog();
    });
  });
  document.querySelectorAll("[data-signature-color]").forEach((button) => {
    button.addEventListener("click", () => {
      signatureColor = button.dataset.signatureColor;
      document.querySelectorAll("[data-signature-color]").forEach((item) =>
        item.classList.toggle("is-active", item === button)
      );
      renderSignatureCanvas();
      renderTypedSignaturePreview();
    });
  });
  document.getElementById("signature-type-input").addEventListener("input", updateSignatureDialog);
  document.getElementById("signature-font").addEventListener("change", renderTypedSignaturePreview);
  document.getElementById("signature-create").addEventListener("click", saveSignature);
  document.getElementById("signature-dialog-close").addEventListener("click", () =>
    document.getElementById("signature-dialog").close()
  );
  document.getElementById("signature-new").addEventListener("click", openSignatureDialog);
  document.getElementById("signature-upload-choose").addEventListener("click", () =>
    document.getElementById("signature-upload-file").click()
  );
  document.getElementById("signature-upload-file").addEventListener("change", (event) => {
    const [file] = event.currentTarget.files || [];
    loadSignatureUpload(file);
    event.currentTarget.value = "";
  });
  const signatureUploadPanel = document.getElementById("signature-upload-panel");
  signatureUploadPanel.addEventListener("dragover", (event) => event.preventDefault());
  signatureUploadPanel.addEventListener("drop", (event) => {
    event.preventDefault();
    loadSignatureUpload(event.dataTransfer?.files?.[0]);
  });
  function renderStampDialogPreview() {
    const label = document.getElementById("stamp-name").value.trim().toUpperCase();
    const preview = document.getElementById("stamp-preview");
    const color = document.getElementById("stamp-color").value;
    const fill = document.getElementById("stamp-fill-enabled").checked
      ? document.getElementById("stamp-fill-color").value
      : "transparent";
    preview.textContent = label || "NEW STAMP";
    preview.style.color = color;
    preview.style.borderColor = color;
    preview.style.backgroundColor = fill;
    document.getElementById("stamp-save").disabled = !label;
    document.getElementById("stamp-fill-color").disabled = fill === "transparent";
  }

  document.getElementById("stamp-create").addEventListener("click", () => {
    document.getElementById("stamp-name").value = "";
    renderStampDialogPreview();
    document.getElementById("stamp-dialog").showModal();
    document.getElementById("stamp-name").focus();
  });
  document.getElementById("stamp-name").addEventListener("input", renderStampDialogPreview);
  document.getElementById("stamp-color").addEventListener("input", renderStampDialogPreview);
  document.getElementById("stamp-fill-color").addEventListener("input", renderStampDialogPreview);
  document.getElementById("stamp-fill-enabled").addEventListener("change", renderStampDialogPreview);
  document.getElementById("stamp-dialog-close").addEventListener("click", () =>
    document.getElementById("stamp-dialog").close()
  );
  document.getElementById("stamp-cancel").addEventListener("click", () =>
    document.getElementById("stamp-dialog").close()
  );
  document.getElementById("stamp-save").addEventListener("click", () => {
    const stamp = {
      label: document.getElementById("stamp-name").value.trim().toUpperCase(),
      color: document.getElementById("stamp-color").value,
      fill: document.getElementById("stamp-fill-enabled").checked
        ? document.getElementById("stamp-fill-color").value
        : null,
    };
    if (!stamp.label) return;
    customStamps.push(stamp);
    activeStamp = stamp;
    document.getElementById("stamp-dialog").close();
    setTool("stamp-gallery");
  });

  async function addImage(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast("Images must be 20 MB or smaller.", { type: "error" });
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast("Choose a PNG or JPEG image.", { type: "error" });
      return;
    }
    const page = state.pages.find((item) => item.id === state.currentId) || state.pages[0];
    if (!page) {
      toast("Open a PDF before inserting an image.", { type: "error" });
      return;
    }
    try {
      const [dataUrl, bitmap] = await Promise.all([
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error("Image could not be read."));
          reader.readAsDataURL(file);
        }),
        createImageBitmap(file),
      ]);
      const width = 0.32;
      const height = Math.min(0.36, width * page.width / page.height / (bitmap.width / bitmap.height));
      bitmap.close();
      const annotation = {
        id: crypto.randomUUID(),
        type: "image",
        x: 0.34,
        y: 0.32,
        w: width,
        h: height,
        dataUrl,
      };
      addAnnotation(page, annotation);
      setTool(state.editorMode === "edit" ? "select" : "drag");
      render();
    } catch (error) {
      console.error("Image insertion failed", error);
      toast("Couldn't insert that image.", { type: "error" });
    }
  }

  async function addAttachment(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast("Attachments must be 20 MB or smaller.", { type: "error" });
      return;
    }
    const page = state.pages.find((item) => item.id === state.currentId) || state.pages[0];
    if (!page) {
      toast("Open a PDF before attaching a file.", { type: "error" });
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Attachment could not be read."));
        reader.readAsDataURL(file);
      });
      addAnnotation(page, {
        id: crypto.randomUUID(),
        type: "attachment",
        x: 0.34,
        y: 0.32,
        w: 0.32,
        h: 0.055,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
      });
      setTool("select");
    } catch (error) {
      console.error("File attachment failed", error);
      toast("Couldn't attach that file.", { type: "error" });
    }
  }

  function eraseAnnotation(page, id, { eraser = false } = {}) {
    const annotation = page.annotations?.find((item) => item.id === id);
    if (!annotation || (isTextMarkAnnotation(annotation) && !eraser)) return;
    commit(() => {
      const deletedTextId = annotation.type === "text" ? annotation.id : null;
      page.annotations = page.annotations.filter((item) =>
        item.id !== id &&
        !(deletedTextId && isTextMarkAnnotation(item) &&
          item.textTarget?.kind === "annotation" &&
          item.textTarget.id === deletedTextId)
      );
      if (state.textSelection?.pageId === page.id && state.textSelection.annotationId === id) {
        state.textSelection = null;
      }
    });
    renderInspector();
  }

  function formatSvgPoints(points, rotation) {
    return points
      .map((point) => {
        const display = baselineToScreen(point, rotation);
        return `${display.x * 1000},${display.y * 1000}`;
      })
      .join(" ");
  }

  function createSvgHitTarget(kind, attributes = {}) {
    const hit = document.createElementNS("http://www.w3.org/2000/svg", kind);
    hit.setAttribute("class", "annotation-hit-line");
    hit.setAttribute("fill", "none");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "24");
    hit.setAttribute("stroke-linecap", "round");
    hit.setAttribute("stroke-linejoin", "round");
    Object.entries(attributes).forEach(([key, value]) => hit.setAttribute(key, value));
    return hit;
  }

  function handleSvgAnnotationClick(event, page, annotation, layer) {
    if (event.target === event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    if (suppressObjectClick) {
      suppressObjectClick = false;
      return;
    }
    if (state.annotationTool === "eraser") {
      eraseAnnotation(page, annotation.id);
      return;
    }
    state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
    renderInspector();
    if (layer.isConnected) renderLayer(layer, page);
  }

  function attachSvgInteraction(layer, page, annotation, hitTarget, paint) {
    let frame = null;
    hitTarget.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !canManipulate()) return;
      event.preventDefault();
      event.stopPropagation();
      svgDrag = {
        mode: "move",
        annotation,
        page,
        layer,
        paint,
        frame,
        pointerId: event.pointerId,
        start: normalizedPoint(event, layer, page),
        origBox: annotationBox(annotation),
        moved: false,
      };
      state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
      renderInspector();
      try {
        hitTarget.setPointerCapture(event.pointerId);
      } catch {}
    });

    if (state.textSelection?.annotationId !== annotation.id) return;
    const origBox = annotationBox(annotation);
    const screenBox = projectBox(origBox, page.rotation);
    frame = document.createElement("div");
    frame.className = "annotation-select-frame";
    frame.style.left = `${screenBox.x * 100}%`;
    frame.style.top = `${screenBox.y * 100}%`;
    frame.style.width = `${screenBox.w * 100}%`;
    frame.style.height = `${screenBox.h * 100}%`;
    layer.append(frame);

    const aspectLocked = Boolean(annotation.signature) && origBox.w > 0 && origBox.h > 0;
    const handles = aspectLocked
      ? ["top-left", "top-right", "bottom-right", "bottom-left"]
      : ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
    const screenDirections = {
      "top-left": [-1, -1], top: [0, -1], "top-right": [1, -1], right: [1, 0],
      "bottom-right": [1, 1], bottom: [0, 1], "bottom-left": [-1, 1], left: [-1, 0],
    };
    for (const corner of handles) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `annotation-image-resize-handle is-${corner}`;
      handle.setAttribute(
        "aria-label",
        `Resize ${annotationName(annotation)} from ${corner.replace("-", " ")}`
      );
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const [screenX, screenY] = screenDirections[corner];
        const center = screenToBaseline({ x: 0.5, y: 0.5 }, page.rotation);
        const moving = screenToBaseline(
          { x: 0.5 + screenX * 0.5, y: 0.5 + screenY * 0.5 },
          page.rotation
        );
        const sx = Math.sign(moving.x - center.x);
        const sy = Math.sign(moving.y - center.y);
        svgDrag = {
          mode: "resize",
          annotation,
          page,
          layer,
          paint,
          frame,
          pointerId: event.pointerId,
          start: normalizedPoint(event, layer, page),
          origBox,
          sx,
          sy,
          fixedX: sx < 0 ? origBox.x + origBox.w : sx > 0 ? origBox.x : origBox.x + origBox.w / 2,
          fixedY: sy < 0 ? origBox.y + origBox.h : sy > 0 ? origBox.y : origBox.y + origBox.h / 2,
          aspectRatio: origBox.w / Math.max(origBox.h, 1e-6),
          aspectLocked,
          moved: false,
        };
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {}
      });
      handle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      frame.append(handle);
    }
  }

  function updateSvgDrag(event) {
    if (!svgDrag || svgDrag.pointerId !== event.pointerId) return;
    const { layer, page, annotation, origBox, start, mode, paint, frame } = svgDrag;
    const point = normalizedPoint(event, layer, page);
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    if (Math.hypot(dx, dy) * Math.max(layer.clientWidth, layer.clientHeight) > 2) {
      svgDrag.moved = true;
    }
    if (!svgDrag.moved) return;
    let box;
    if (mode === "move") {
      box = {
        x: Math.max(0, Math.min(1 - origBox.w, origBox.x + dx)),
        y: Math.max(0, Math.min(1 - origBox.h, origBox.y + dy)),
        w: origBox.w,
        h: origBox.h,
      };
    } else {
      const { sx, sy, fixedX, fixedY, aspectLocked, aspectRatio } = svgDrag;
      let w = sx ? origBox.w + sx * dx : origBox.w;
      let h = sy ? origBox.h + sy * dy : origBox.h;
      if (aspectLocked) {
        const scale = Math.max(
          sx ? w / origBox.w : h / origBox.h,
          0.008 / origBox.w,
          0.008 / origBox.h
        );
        const maxScale = Math.min(
          sx < 0 ? fixedX / origBox.w : (1 - fixedX) / origBox.w,
          sy < 0 ? fixedY / origBox.h : (1 - fixedY) / origBox.h
        );
        w = origBox.w * Math.min(scale, maxScale);
        h = w / aspectRatio;
      } else {
        w = origBox.w > 0
          ? Math.max(0.008, Math.min(w, sx < 0 ? fixedX : sx > 0 ? 1 - fixedX : origBox.w))
          : 0;
        h = origBox.h > 0
          ? Math.max(0.008, Math.min(h, sy < 0 ? fixedY : sy > 0 ? 1 - fixedY : origBox.h))
          : 0;
      }
      let x = origBox.x;
      let y = origBox.y;
      if (origBox.w > 0) x = sx < 0 ? fixedX - w : sx > 0 ? fixedX : origBox.x;
      else if (sx) x = Math.max(0, Math.min(1, origBox.x + dx));
      if (origBox.h > 0) y = sy < 0 ? fixedY - h : sy > 0 ? fixedY : origBox.y;
      else if (sy) y = Math.max(0, Math.min(1, origBox.y + dy));
      box = { x, y, w, h };
    }
    const patch = geometryPatch(annotation, origBox, box);
    svgDrag.preview = patch;
    paint(patch);
    if (frame) {
      const screenBox = projectBox(box, page.rotation);
      frame.style.left = `${screenBox.x * 100}%`;
      frame.style.top = `${screenBox.y * 100}%`;
      frame.style.width = `${screenBox.w * 100}%`;
      frame.style.height = `${screenBox.h * 100}%`;
    }
  }

  function finishSvgDrag(event) {
    if (!svgDrag || svgDrag.pointerId !== event.pointerId) return;
    const drag = svgDrag;
    svgDrag = null;
    if (event.type === "pointercancel") {
      if (drag.moved && drag.layer.isConnected) renderLayer(drag.layer, drag.page);
      return;
    }
    if (!drag.moved || !drag.preview) return;
    suppressObjectClick = true;
    setTimeout(() => {
      suppressObjectClick = false;
    }, 0);
    commit(() => {
      drag.page.annotations = drag.page.annotations.map((item) =>
        item.id === drag.annotation.id ? { ...item, ...drag.preview } : item
      );
    });
  }

  document.addEventListener("pointermove", updateSvgDrag);
  document.addEventListener("pointerup", finishSvgDrag);
  document.addEventListener("pointercancel", finishSvgDrag);

  function resolveTextMarkTarget(layer, annotation) {
    if (!annotation.textTarget) return null;
    const matching = (root) =>
      [...(root?.querySelectorAll("[data-text-target-id]") || [])].find(
        (element) =>
          element.dataset.textTargetId === annotation.textTarget.id &&
          element.dataset.textTargetKind === annotation.textTarget.kind
      ) || null;
    return matching(layer) || matching(layer.parentElement);
  }

  function updateTextMarkGeometry(annotation, segments) {
    const first = segments[0];
    const updated = {
      ...annotation,
      segments,
      x: first.x,
      y: first.y,
      w: first.w,
      h: first.h,
    };
    if (updated.type === "draw") {
      const lineY = updated.tool === "annotate-strike"
        ? first.y + first.h * 0.52
        : first.y + first.h * 0.9;
      updated.points = updated.tool === "annotate-squiggle"
        ? Array.from({ length: 13 }, (_, index) => ({
            x: first.x + (first.w * index) / 12,
            y: lineY + (index % 2 ? -1 : 1) * first.h * 0.1,
          }))
        : [{ x: first.x, y: lineY }, { x: first.x + first.w, y: lineY }];
    }
    return updated;
  }

  function moveAttachedTextMarks(page, target, from, to) {
    if (!target || !from.w || !from.h) return;
    const scaleX = to.w / from.w;
    const scaleY = to.h / from.h;
    page.annotations = page.annotations.map((annotation) => {
      if (
        !isTextMarkAnnotation(annotation) ||
        annotation.textTarget?.kind !== target.kind ||
        annotation.textTarget.id !== target.id ||
        !annotation.segments?.length
      ) return annotation;
      const segments = annotation.segments.map((segment) => ({
        x: to.x + (segment.x - from.x) * scaleX,
        y: to.y + (segment.y - from.y) * scaleY,
        w: segment.w * scaleX,
        h: segment.h * scaleY,
      }));
      return updateTextMarkGeometry(annotation, segments);
    });
  }

  function refreshAttachedTextMarks(page, target, updatedTextAnnotation) {
    if (!target) return;
    const pageElement = [...els.pages.children].find((element) => element.dataset.id === page.id);
    const layer = pageElement?.querySelector(".page-annotation-layer");
    if (!layer) return;
    if (updatedTextAnnotation?.type === "text") {
      const mark = [...layer.querySelectorAll("[data-annotation-id]")].find(
        (element) => element.dataset.annotationId === updatedTextAnnotation.id
      );
      if (mark) {
        mark.style.fontSize = `${Math.max(6, (updatedTextAnnotation.fontSize || 12) * state.zoom)}px`;
        mark.style.fontWeight = updatedTextAnnotation.fontWeight || "normal";
        mark.style.fontStyle = updatedTextAnnotation.fontStyle || "normal";
        mark.style.fontFamily = updatedTextAnnotation.fontFamily === "TimesRoman"
          ? '"Times New Roman", Times, serif'
          : updatedTextAnnotation.fontFamily === "Courier"
            ? "Courier, monospace"
            : "Arial, Helvetica, sans-serif";
        const input = mark.querySelector(".annotation-text-input");
        if (input) input.textContent = updatedTextAnnotation.text || "";
      }
    }
    for (const annotation of page.annotations || []) {
      if (
        isTextMarkAnnotation(annotation) &&
        annotation.textTarget?.kind === target.kind &&
        annotation.textTarget.id === target.id
      ) {
        textMarkSegments(annotation, page, layer);
      }
    }
  }

  function textMarkSegments(annotation, page, layer, staticPreview = false) {
    const stored = annotation.segments || (
      annotation.type === "highlight"
        ? [{ x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h }]
        : []
    );
    const target = resolveTextMarkTarget(layer, annotation);
    if (!target || !annotation.textRange) return { segments: stored, changed: false };
    const content = target.matches(".pdf-text-item, .annotation-text-input, .annotation-inline-edit-text")
      ? target
      : target.querySelector(".annotation-inline-edit-text, .annotation-text-input");
    if (!content) return { segments: stored, changed: false };
    const range = rangeForTextOffsets(content, annotation.textRange.start, annotation.textRange.end);
    if (!range) return { segments: stored, changed: false };
    const pageContainer = layer.parentElement;
    const resolved = [...range.getClientRects()]
      .map((rect) => selectionRectToBaselineBox(rect, pageContainer, page))
      .filter(Boolean);
    if (!resolved.length) return { segments: stored, changed: false };
    const changed = stored.length !== resolved.length || resolved.some((segment, index) =>
      ["x", "y", "w", "h"].some(
        (key) => Math.abs(segment[key] - stored[index][key]) > 0.00005
      )
    );
    if (changed && !staticPreview) {
      Object.assign(annotation, updateTextMarkGeometry(annotation, resolved));
    }
    return { segments: staticPreview || changed ? resolved : stored, changed: changed && !staticPreview };
  }

  function renderTextMark(layer, page, annotation, staticPreview) {
    const { segments, changed } = textMarkSegments(annotation, page, layer, staticPreview);
    const color = annotation.color || (annotation.type === "highlight" ? "#f5d547" : "#171717");
    if (!segments.length && annotation.type === "draw" && annotation.points?.length) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("annotation-path", "annotation-text-mark");
      svg.dataset.annotationId = annotation.id;
      svg.setAttribute("viewBox", "0 0 1000 1000");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.style.pointerEvents = "none";
      const visible = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      visible.setAttribute("points", formatSvgPoints(annotation.points, page.rotation));
      visible.setAttribute("fill", "none");
      visible.setAttribute("stroke", color);
      visible.setAttribute("stroke-width", String(annotation.width || 2));
      visible.setAttribute("stroke-opacity", String(annotation.opacity ?? 1));
      visible.setAttribute("stroke-linecap", "round");
      visible.setAttribute("stroke-linejoin", "round");
      svg.append(visible);
      const hit = createSvgHitTarget("polyline", { points: visible.getAttribute("points") });
      hit.classList.add("annotation-text-mark-hit");
      svg.append(hit);
      svg.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.annotationTool === "eraser" && !staticPreview) {
          eraseAnnotation(page, annotation.id, { eraser: true });
        }
      });
      layer.append(svg);
      return false;
    }
    if (!segments.length) return false;
    if (annotation.type === "highlight") {
      for (const segment of segments) {
        const box = projectBox(segment, page.rotation);
        const mark = document.createElement("div");
        mark.className = "annotation-mark annotation-highlight annotation-text-mark";
        mark.dataset.annotationId = annotation.id;
        mark.style.left = `${box.x * 100}%`;
        mark.style.top = `${box.y * 100}%`;
        mark.style.width = `${box.w * 100}%`;
        mark.style.height = `${box.h * 100}%`;
        mark.style.backgroundColor = color;
        mark.style.opacity = String(annotation.opacity ?? 0.35);
        mark.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.annotationTool === "eraser" && !staticPreview) {
            eraseAnnotation(page, annotation.id, { eraser: true });
          }
        });
        layer.append(mark);
      }
      return changed;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("annotation-path", "annotation-text-mark");
    svg.dataset.annotationId = annotation.id;
    svg.setAttribute("viewBox", "0 0 1000 1000");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.pointerEvents = "none";
    for (const segment of segments) {
      const lineY = annotation.tool === "annotate-strike"
        ? segment.y + segment.h * 0.52
        : segment.y + segment.h * 0.9;
      const points = annotation.tool === "annotate-squiggle"
        ? Array.from({ length: 13 }, (_, index) => ({
            x: segment.x + (segment.w * index) / 12,
            y: lineY + (index % 2 ? -1 : 1) * segment.h * 0.1,
          }))
        : [{ x: segment.x, y: lineY }, { x: segment.x + segment.w, y: lineY }];
      const visible = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      visible.setAttribute("points", formatSvgPoints(points, page.rotation));
      visible.setAttribute("fill", "none");
      visible.setAttribute("stroke", color);
      visible.setAttribute("stroke-width", String(annotation.width || 2));
      visible.setAttribute("stroke-opacity", String(annotation.opacity ?? 1));
      visible.setAttribute("stroke-linecap", "round");
      visible.setAttribute("stroke-linejoin", "round");
      svg.append(visible);
      const hit = createSvgHitTarget("polyline", { points: visible.getAttribute("points") });
      hit.classList.add("annotation-text-mark-hit");
      svg.append(hit);
    }
    svg.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.annotationTool === "eraser" && !staticPreview) {
        eraseAnnotation(page, annotation.id, { eraser: true });
      }
    });
    layer.append(svg);
    return changed;
  }

  function renderLayer(layer, page, { scale = state.zoom, staticPreview = false } = {}) {
    layer.inert = staticPreview;
    layer.setAttribute("aria-hidden", String(staticPreview));
    layer.replaceChildren();
    const textMarks = [];
    let textMarkGeometryChanged = false;
    for (const annotation of page.annotations || []) {
      if (isTextMarkAnnotation(annotation)) {
        textMarks.push(annotation);
        continue;
      }
      if (annotation.type === "shape" && annotation.shape === "polyline" && annotation.points?.length) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("annotation-path", "annotation-shape-line");
        svg.dataset.annotationId = annotation.id;
        svg.setAttribute("viewBox", "0 0 1000 1000");
        svg.setAttribute("preserveAspectRatio", "none");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        path.setAttribute("points", formatSvgPoints(annotation.points, page.rotation));
        path.setAttribute("fill", "none");
        setShapeSvgStroke(path, annotation);
        addShapeSvgMarkers(svg, path, annotation);
        svg.append(path);
        const polylineHit = createSvgHitTarget("polyline", { points: path.getAttribute("points") });
        svg.append(polylineHit);
        svg.addEventListener("click", (event) =>
          handleSvgAnnotationClick(event, page, annotation, layer)
        );
        layer.append(svg);
        attachSvgInteraction(layer, page, annotation, polylineHit, (patch) => {
          const value = formatSvgPoints(patch.points, page.rotation);
          path.setAttribute("points", value);
          polylineHit.setAttribute("points", value);
        });
        continue;
      }
      if (
        annotation.type === "text-edit" &&
        (annotation.moveX || annotation.moveY)
      ) {
        const sourceBox = projectBox(annotation, page.rotation);
        const cover = document.createElement("div");
        cover.className = "annotation-mark annotation-inline-edit-cover";
        cover.style.left = `${sourceBox.x * 100}%`;
        cover.style.top = `${sourceBox.y * 100}%`;
        cover.style.width = `${sourceBox.w * 100}%`;
        cover.style.height = `${sourceBox.h * 100}%`;
        cover.style.backgroundColor = annotation.fill || "#ffffff";
        cover.setAttribute("aria-hidden", "true");
        layer.append(cover);
      }
      const displayAnnotation =
        annotation.type === "text-edit" && (annotation.moveX || annotation.moveY)
          ? {
              ...annotation,
              x: annotation.x + (annotation.moveX || 0),
              y: annotation.y + (annotation.moveY || 0),
            }
          : annotation;
      const box = projectBox(displayAnnotation, page.rotation);
      if (annotation.type === "draw") {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("annotation-path");
        svg.dataset.annotationId = annotation.id;
        svg.setAttribute("viewBox", "0 0 1000 1000");
        svg.setAttribute("preserveAspectRatio", "none");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        path.setAttribute("points", formatSvgPoints(annotation.points, page.rotation));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", annotation.color || "#171717");
        path.setAttribute("stroke-width", String(annotation.width || 2));
        path.setAttribute("stroke-opacity", String(annotation.opacity ?? 1));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.append(path);
        const drawHit = createSvgHitTarget("polyline", { points: path.getAttribute("points") });
        svg.append(drawHit);
        svg.addEventListener("click", (event) =>
          handleSvgAnnotationClick(event, page, annotation, layer)
        );
        layer.append(svg);
        attachSvgInteraction(layer, page, annotation, drawHit, (patch) => {
          const value = formatSvgPoints(patch.points, page.rotation);
          path.setAttribute("points", value);
          drawHit.setAttribute("points", value);
        });
      } else if (annotation.type === "shape" && annotation.shape === "line") {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("annotation-path", "annotation-shape-line");
        svg.dataset.annotationId = annotation.id;
        svg.setAttribute("viewBox", "0 0 1000 1000");
        svg.setAttribute("preserveAspectRatio", "none");
        const start = baselineToScreen({ x: annotation.x, y: annotation.y }, page.rotation);
        const end = baselineToScreen({ x: annotation.x + annotation.w, y: annotation.y + annotation.h }, page.rotation);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(start.x * 1000));
        line.setAttribute("y1", String(start.y * 1000));
        line.setAttribute("x2", String(end.x * 1000));
        line.setAttribute("y2", String(end.y * 1000));
        setShapeSvgStroke(line, annotation);
        addShapeSvgMarkers(svg, line, annotation);
        svg.append(line);
        const lineHit = createSvgHitTarget("line", {
          x1: line.getAttribute("x1"),
          y1: line.getAttribute("y1"),
          x2: line.getAttribute("x2"),
          y2: line.getAttribute("y2"),
        });
        svg.append(lineHit);
        svg.addEventListener("click", (event) =>
          handleSvgAnnotationClick(event, page, annotation, layer)
        );
        layer.append(svg);
        attachSvgInteraction(layer, page, annotation, lineHit, (patch) => {
          const hitStart = baselineToScreen({ x: patch.x, y: patch.y }, page.rotation);
          const hitEnd = baselineToScreen(
            { x: patch.x + patch.w, y: patch.y + patch.h },
            page.rotation
          );
          const values = {
            x1: String(hitStart.x * 1000),
            y1: String(hitStart.y * 1000),
            x2: String(hitEnd.x * 1000),
            y2: String(hitEnd.y * 1000),
          };
          Object.entries(values).forEach(([key, value]) => {
            line.setAttribute(key, value);
            lineHit.setAttribute(key, value);
          });
        });
      } else {
        const mark = document.createElement("div");
        mark.className = `annotation-mark annotation-${annotation.type}`;
        mark.style.left = `${box.x * 100}%`;
        mark.style.top = `${box.y * 100}%`;
        mark.style.width = `${box.w * 100}%`;
        mark.style.height = `${box.h * 100}%`;
        if (annotation.type === "highlight") {
          mark.style.backgroundColor = annotation.color || "#f5d547";
          mark.style.opacity = String(annotation.opacity ?? 0.35);
        }
        if (annotation.type === "shape" && annotation.shape === "smiley") {
          mark.classList.add("annotation-shape", "annotation-shape-smiley");
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 100 100");
          svg.setAttribute("aria-hidden", "true");
          const addShape = (name, attributes) => {
            const element = document.createElementNS("http://www.w3.org/2000/svg", name);
            Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
            svg.append(element);
          };
          const color = annotation.color || "#171717";
          addShape("circle", {
            cx: "50", cy: "50", r: "46",
            fill: annotation.fill || "none",
            "fill-opacity": String(annotation.fillOpacity ?? 1),
            stroke: color,
            "stroke-width": String(Math.max(1, annotation.width || 1) * 1.5),
            "stroke-opacity": String(annotation.opacity ?? 1),
          });
          addShape("circle", { cx: "35", cy: "39", r: "4", fill: color });
          addShape("circle", { cx: "65", cy: "39", r: "4", fill: color });
          addShape("path", { d: "M28 58 Q50 82 72 58", fill: "none", stroke: color, "stroke-width": "4", "stroke-linecap": "round" });
          mark.append(svg);
        } else if (annotation.type === "shape") {
          mark.classList.add("annotation-shape", `annotation-shape-${annotation.shape}`);
          const strokeColor = annotation.color || "#171717";
          mark.style.borderColor = colorAtOpacity(strokeColor, annotation.opacity ?? 1);
          mark.style.borderWidth = `${Math.max(1, annotation.width || 1) * scale}px`;
          mark.style.borderStyle = annotation.strokeStyle === "dashed" || annotation.strokeStyle === "long-dash"
            ? "dashed"
            : annotation.strokeStyle === "dotted" || annotation.strokeStyle === "wavy"
              ? "dotted"
              : "solid";
          if (annotation.fill) {
            mark.style.backgroundColor = colorAtOpacity(annotation.fill, annotation.fillOpacity ?? 1);
          }
          if (annotation.shape === "ellipse") mark.style.borderRadius = "50%";
          const paths = {
            arc: "M 5 90 Q 50 5 95 90",
            pentagon: "M 50 5 L 95 38 L 78 92 L 22 92 L 5 38 Z",
            cloud: "M 22 76 C 5 76 4 53 20 47 C 15 28 39 19 50 35 C 63 13 88 25 84 47 C 102 53 96 77 78 77 Z",
            polyline: "M 5 78 L 31 35 L 56 62 L 95 18",
            arrow: "M 5 50 L 82 50 M 62 27 L 85 50 L 62 73",
          };
          if (paths[annotation.shape]) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 100 100");
            svg.setAttribute("preserveAspectRatio", "none");
            svg.setAttribute("aria-hidden", "true");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", paths[annotation.shape]);
            const closed = annotation.shape === "pentagon" || annotation.shape === "cloud";
            path.setAttribute("fill", closed ? annotation.fill || "none" : "none");
            path.setAttribute("fill-opacity", String(annotation.fillOpacity ?? 1));
            setShapeSvgStroke(path, annotation);
            svg.append(path);
            mark.append(svg);
          }
        }
        if (annotation.type === "formField") {
          mark.classList.add("annotation-form-field", `annotation-form-field-${annotation.fieldType}`);
          mark.style.setProperty("--form-field-color", annotation.color || "#2563eb");
          const label = document.createElement("span");
          if (annotation.fieldType === "checkbox" || annotation.fieldType === "radio") {
            label.innerHTML = icon(annotation.fieldType);
            label.setAttribute("aria-hidden", "true");
          } else {
            label.textContent = {
              signature: "Sign here",
              text: annotation.defaultValue || "Text field",
              dropdown: "Select an option",
              list: (annotation.options || []).join("    "),
            }[annotation.fieldType] || "Form field";
          }
          mark.append(label);
          if (annotation.indicator) {
            const indicator = document.createElement("span");
            indicator.className = "form-field-indicator";
            indicator.textContent = "*";
            indicator.setAttribute("aria-hidden", "true");
            mark.append(indicator);
          }
        }
        if (annotation.type === "attachment") {
          mark.classList.add("annotation-attachment");
          mark.dataset.movable = "true";
          mark.insertAdjacentHTML("beforeend", icon("paperclip"));
          const label = document.createElement("span");
          label.textContent = annotation.name;
          mark.append(label);
        }
        if (annotation.type === "image") {
          mark.classList.add("annotation-image");
          if (annotation.signature) mark.classList.add("annotation-signature-image");
          const image = document.createElement("img");
          image.src = annotation.dataUrl;
          image.alt = annotation.signature ? `Signature${annotation.name ? `: ${annotation.name}` : ""}` : "Inserted image";
          mark.append(image);
        }
        if (annotation.type === "text") {
          mark.classList.add("annotation-text");
          mark.dataset.textTargetId = annotation.id;
          mark.dataset.textTargetKind = "annotation";
          if (annotation.stamp) mark.classList.add("annotation-stamp");
          mark.dataset.movable = String(
            !annotation.cellText && (!annotation.directEdit || annotation.formLabel)
          );
          mark.style.color = annotation.color || "#171717";
          mark.style.fontFamily = annotation.fontFamily === "TimesRoman"
            ? '"Times New Roman", Times, serif'
            : annotation.fontFamily === "Courier"
              ? "Courier, monospace"
              : "Arial, Helvetica, sans-serif";
          mark.style.fontSize = `${Math.max(6, (annotation.fontSize || 12) * scale)}px`;
          mark.style.fontWeight = annotation.fontWeight || "normal";
          mark.style.fontStyle = annotation.fontStyle || "normal";
          mark.style.backgroundColor = annotation.fill || "transparent";
          if (annotation.opacity != null) mark.style.opacity = String(annotation.opacity);
          if (annotation.strokeWidth > 0) {
            mark.style.border = `${annotation.strokeWidth}px solid ${annotation.strokeColor || annotation.color || "#171717"}`;
          }
          mark.style.textDecoration = [
            annotation.underline ? "underline" : "",
            annotation.strike ? "line-through" : "",
          ].filter(Boolean).join(" ");
          mark.style.textAlign = annotation.align || "left";
          if (annotation.verticalAlign) {
            mark.style.display = "flex";
            mark.style.alignItems = {
              top: "flex-start",
              middle: "center",
              bottom: "flex-end",
            }[annotation.verticalAlign] || "center";
          }
          const textContent = document.createElement("span");
          textContent.className = "annotation-text-input";
          textContent.contentEditable = String(
            !staticPreview && (
              state.annotationTool === "text" ||
              (state.annotationTool === "form-label" && annotation.formLabel) ||
              ((state.annotationTool === "select" || state.annotationTool === "text") &&
                (annotation.cellText ||
                  annotation.directEdit ||
                  state.textSelection?.annotationId === annotation.id)) ||
              (textMarkupTools.has(state.annotationTool) &&
                state.textSelection?.annotationId === annotation.id)
            )
          );
          textContent.dataset.directEdit = String(Boolean(annotation.directEdit));
          textContent.dataset.cellText = String(Boolean(annotation.cellText));
          textContent.setAttribute("role", "textbox");
          textContent.setAttribute("aria-label", "Add text annotation");
          textContent.setAttribute("spellcheck", "false");
          textContent.textContent = annotation.text;
          if (annotation.verticalAlign) textContent.style.width = "100%";
          if (annotation.autoFit && !annotation.cellText) {
            const measure = document.createElement("canvas").getContext("2d");
            if (measure) {
              const fontSize = Math.max(6, (annotation.fontSize || 12) * scale);
              measure.font = `${annotation.fontStyle || "normal"} ${annotation.fontWeight || "normal"} ${fontSize}px ${mark.style.fontFamily}`;
              const contentWidth = measure.measureText(annotation.text || "").width;
              const availableWidth = Math.max(1, box.w * page.width * scale - 4);
              mark.style.fontSize = `${Math.max(6, fontSize * Math.min(1, availableWidth / Math.max(1, contentWidth)))}px`;
            }
          }
          if (annotation.cellText) {
            mark.style.fontSize = `${Math.max(6, (annotation.fontSize || 9) * scale)}px`;
            mark.style.fontFamily = editorFontFamily(annotation.fontFamily);
            mark.style.fontWeight = annotation.fontWeight || "normal";
            mark.style.fontStyle = annotation.fontStyle || "normal";
            textContent.style.whiteSpace = "pre";
            textContent.style.transformOrigin = "left center";
          }
          mark.dataset.annotationId = annotation.id;
          mark.append(textContent);
          if (annotation.cellText) fitCellText(textContent, annotation, box, page, scale);
          let suppressTextBoxClick = false;
          textContent.addEventListener("focus", () => inlineEditBases.set(textContent, annotation.text));
          textContent.addEventListener("input", () => {
            const editedText = textContent.textContent || "";
            if (state.textSelection?.annotationId === annotation.id) els.selectedText.value = editedText;
            if (annotation.cellText) fitCellText(textContent, annotation, box, page);
          });
          textContent.addEventListener("blur", () => {
            const original = inlineEditBases.get(textContent);
            const editedText = textContent.textContent || "";
            if (original && original.text !== editedText) {
              updateAnnotation(annotation, { text: editedText });
            }
          });
          mark.addEventListener("click", (event) => {
            if (suppressTextBoxClick) {
              suppressTextBoxClick = false;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (
              (state.annotationTool !== "select" && state.annotationTool !== "text") ||
              annotation.cellText
            ) {
              return;
            }
            requestAnimationFrame(() => {
              if (
                textContent.isConnected &&
                (state.annotationTool === "select" || state.annotationTool === "text")
              ) {
                textContent.contentEditable = "true";
                focusAndSelect(textContent, false);
              }
            });
          });
        }
        if (annotation.type === "replace") {
          mark.classList.add("annotation-replacement");
          mark.style.backgroundColor = annotation.fill || "#ffffff";
          mark.style.color = annotation.color || "#171717";
          mark.style.fontSize = `${Math.max(8, (annotation.fontSize || 12) * scale)}px`;
          mark.style.textAlign = annotation.align || "left";
          mark.textContent = annotation.text;
        }
        if (annotation.type === "text-edit") {
          mark.classList.add("annotation-inline-edit");
          if (annotation.sourceTextId) {
            mark.dataset.textTargetId = annotation.sourceTextId;
            mark.dataset.textTargetKind = "pdf";
          }
          if (!annotation.moveX && !annotation.moveY && annotation.fill) {
            mark.style.backgroundColor = annotation.fill;
          }
          mark.style.color = annotation.textColor || annotation.color || "#171717";
          mark.style.fontSize = `${Math.max(8, (annotation.fontSize || 12) * scale)}px`;
          mark.style.fontFamily = annotation.fontFamily || "Arial, sans-serif";
          mark.style.fontWeight = annotation.fontWeight || "normal";
          mark.style.fontStyle = annotation.fontStyle || "normal";
          const measure = document.createElement("canvas").getContext("2d");
          const textContent = document.createElement("span");
          textContent.className = "annotation-inline-edit-text";
          textContent.contentEditable = String(
            !staticPreview &&
              (state.annotationTool === "select" && document.activeElement?.classList.contains("annotation-inline-edit-text") ||
                textMarkupTools.has(state.annotationTool) &&
                  state.textSelection?.annotationId === annotation.id)
          );
          textContent.setAttribute("role", "textbox");
          textContent.setAttribute("aria-label", "Edit selected PDF text");
          textContent.setAttribute("spellcheck", "false");
          const formattingRanges = !staticPreview && annotation.sourceTextId
            ? rangesForTarget(page.id, annotation.sourceTextId)
            : [];
          renderFormattedText(textContent, annotation.text, formattingRanges, scale);
          if (!staticPreview && annotation.validationError) {
            textContent.setAttribute("aria-invalid", "true");
            textContent.title = annotation.validationError;
          }
          textContent.style.font = `${mark.style.fontStyle} ${mark.style.fontWeight} ${mark.style.fontSize} ${mark.style.fontFamily}`;
          if (measure) {
            measure.font = textContent.style.font;
            const contentWidth = measure.measureText(annotation.text).width;
            const availableWidth = Math.max(1, box.w * page.width * scale);
            const widthScale = contentWidth > availableWidth ? availableWidth / contentWidth : 1;
            textContent.style.transform = `scaleX(${widthScale})`;
          }
          mark.dataset.annotationId = annotation.id;
          mark.append(textContent);
          textContent.addEventListener("focus", () => inlineEditBases.set(textContent, annotation.text));
          textContent.addEventListener("input", () => {
            annotation.text = textContent.textContent || "";
            if (state.textSelection?.annotationId === annotation.id) {
              els.selectedText.value = annotation.text;
              document.getElementById("pdf-text-current").textContent = annotation.text;
            }
            renderThumbnail(page);
            const measure = document.createElement("canvas").getContext("2d");
            if (measure) {
              measure.font = textContent.style.font;
              const contentWidth = measure.measureText(annotation.text).width;
              const availableWidth = Math.max(1, box.w * page.width * scale);
              textContent.style.transform = `scaleX(${contentWidth > availableWidth ? availableWidth / contentWidth : 1})`;
            }
          });
          textContent.addEventListener("blur", () => {
            const originalText = inlineEditBases.get(textContent);
            const editedText = textContent.textContent || "";
            if (originalText !== editedText) {
              annotation.text = originalText;
              void textEditValidationError(page, { ...annotation, text: editedText }).then(
                (validationError) => {
                  updateAnnotation(annotation, {
                    text: editedText,
                    validationError,
                  });
                  if (validationError) {
                    toast(
                      `This in-place text edit cannot be exported yet: ${validationError}`,
                      { type: "error" }
                    );
                  }
                }
              );
            }
          });
        }
        if (
          annotation.type === "image" ||
          annotation.type === "shape" ||
          annotation.type === "attachment" ||
          annotation.type === "formField" ||
          annotation.type === "text-edit" ||
          annotation.type === "replace" ||
          annotation.type === "highlight" ||
          (annotation.type === "text" && !annotation.cellText) ||
          (annotation.type === "text" && annotation.formLabel)
        ) {
          mark.addEventListener("pointerdown", (event) => {
            const isAltDragOnEditedPdfText =
              annotation.type === "text-edit" &&
              event.altKey &&
              event.target.closest(".annotation-inline-edit-text");
            if (
              (textMarkupTools.has(state.annotationTool) &&
                (annotation.type === "text" || annotation.type === "text-edit")) ||
              event.target.closest(".annotation-image-resize-handle") ||
              (event.target.closest(".annotation-inline-edit-text") && !isAltDragOnEditedPdfText) ||
              (textMarkupTools.has(state.annotationTool) &&
                event.target.closest(".annotation-text-input"))
            ) return;
            if (!canManipulate() || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const start = normalizedPoint(event, layer, page);
            const dragX = annotation.x + (annotation.moveX || 0);
            const dragY = annotation.y + (annotation.moveY || 0);
            objectDrag = {
              annotation,
              page,
              mark,
              pointerId: event.pointerId,
              start,
              x: dragX,
              y: dragY,
              moved: false,
            };
            state.textSelection = {
              pageId: page.id,
              kind: "annotation",
              annotationId: annotation.id,
            };
            renderInspector();
            mark.setPointerCapture(event.pointerId);
          });
          mark.addEventListener("pointermove", (event) => {
            if (!objectDrag || objectDrag.pointerId !== event.pointerId) return;
            const point = normalizedPoint(event, layer, page);
            const dx = point.x - objectDrag.start.x;
            const dy = point.y - objectDrag.start.y;
            if (Math.hypot(dx, dy) * Math.max(layer.clientWidth, layer.clientHeight) > 2) {
              objectDrag.moved = true;
            }
            if (!objectDrag.moved) return;
            if (objectDrag.mode === "resize") {
              const { sx, sy, fixedX, fixedY, aspectRatio, aspectLocked } = objectDrag;
              let w = sx ? objectDrag.width + sx * dx : objectDrag.width;
              let h = sy ? objectDrag.height + sy * dy : objectDrag.height;
              if (aspectLocked) {
                const scale = Math.max(
                  sx ? w / objectDrag.width : h / objectDrag.height,
                  0.008 / objectDrag.width,
                  0.008 / objectDrag.height
                );
                const maxScale = Math.min(
                  sx < 0 ? fixedX / objectDrag.width : (1 - fixedX) / objectDrag.width,
                  sy < 0 ? fixedY / objectDrag.height : (1 - fixedY) / objectDrag.height
                );
                w = objectDrag.width * Math.min(scale, maxScale);
                h = w / aspectRatio;
              } else {
                w = Math.max(0.008, Math.min(w, sx < 0 ? fixedX : sx > 0 ? 1 - fixedX : 1 - annotation.x));
                h = Math.max(0.008, Math.min(h, sy < 0 ? fixedY : sy > 0 ? 1 - fixedY : 1 - annotation.y));
              }
              const x = sx < 0 ? fixedX - w : sx > 0 ? fixedX : annotation.x;
              const y = sy < 0 ? fixedY - h : sy > 0 ? fixedY : annotation.y;
              const resizedBox = projectBox({ ...annotation, x, y, w, h }, page.rotation);
              mark.style.left = `${resizedBox.x * 100}%`;
              mark.style.top = `${resizedBox.y * 100}%`;
              mark.style.width = `${resizedBox.w * 100}%`;
              mark.style.height = `${resizedBox.h * 100}%`;
              objectDrag.preview = { x, y, w, h };
              return;
            }
            const x = Math.max(0, Math.min(1 - annotation.w, objectDrag.x + dx));
            const y = Math.max(0, Math.min(1 - annotation.h, objectDrag.y + dy));
            const movedBox = projectBox({ ...annotation, x, y, moveX: 0, moveY: 0 }, page.rotation);
            mark.style.left = `${movedBox.x * 100}%`;
            mark.style.top = `${movedBox.y * 100}%`;
          });
          const finishObjectDrag = (event) => {
            if (!objectDrag || objectDrag.pointerId !== event.pointerId) return;
            const drag = objectDrag;
            objectDrag = null;
            if (!drag.moved) return;
            suppressObjectClick = true;
            setTimeout(() => {
              suppressObjectClick = false;
            }, 0);
            if (drag.mode === "resize") {
              if (!drag.preview) return;
              commit(() => {
                page.annotations = page.annotations.map((item) =>
                  item.id === annotation.id ? { ...item, ...drag.preview } : item
                );
                const target = annotation.type === "text"
                  ? { kind: "annotation", id: annotation.id }
                  : annotation.type === "text-edit" && annotation.sourceTextId
                    ? { kind: "pdf", id: annotation.sourceTextId }
                    : null;
                const offsetX = annotation.type === "text-edit" ? annotation.moveX || 0 : 0;
                const offsetY = annotation.type === "text-edit" ? annotation.moveY || 0 : 0;
                moveAttachedTextMarks(
                  page,
                  target,
                  {
                    x: annotation.x + offsetX,
                    y: annotation.y + offsetY,
                    w: annotation.w,
                    h: annotation.h,
                  },
                  {
                    x: drag.preview.x + offsetX,
                    y: drag.preview.y + offsetY,
                    w: drag.preview.w,
                    h: drag.preview.h,
                  }
                );
              });
              return;
            }
            const point = normalizedPoint(event, layer, page);
            const x = Math.max(0, Math.min(1 - annotation.w, drag.x + point.x - drag.start.x));
            const y = Math.max(0, Math.min(1 - annotation.h, drag.y + point.y - drag.start.y));
            if (annotation.type === "text-edit") {
              commit(() => {
                page.annotations = page.annotations.map((item) =>
                  item.id === annotation.id
                    ? { ...item, moveX: x - annotation.x, moveY: y - annotation.y }
                    : item
                );
                if (annotation.sourceTextId) {
                  moveAttachedTextMarks(
                    page,
                    { kind: "pdf", id: annotation.sourceTextId },
                    {
                      x: annotation.x + (annotation.moveX || 0),
                      y: annotation.y + (annotation.moveY || 0),
                      w: annotation.w,
                      h: annotation.h,
                    },
                    { x, y, w: annotation.w, h: annotation.h }
                  );
                }
              });
              return;
            }
            commit(() => {
              page.annotations = page.annotations.map((item) =>
                item.id === annotation.id ? { ...item, x, y } : item
              );
              if (annotation.type === "text") {
                moveAttachedTextMarks(
                  page,
                  { kind: "annotation", id: annotation.id },
                  annotation,
                  { ...annotation, x, y }
                );
              }
            });
          };
          mark.addEventListener("pointerup", finishObjectDrag);
          mark.addEventListener("pointercancel", finishObjectDrag);
        }
        if (!staticPreview &&
          state.textSelection?.annotationId === annotation.id &&
          annotation.type !== "draw" &&
          !(annotation.type === "text" && annotation.cellText)
        ) {
          mark.classList.add("is-selected");
        }
        const resizable = ["image", "shape", "attachment", "formField", "text-edit", "replace", "highlight"]
          .includes(annotation.type) ||
          (annotation.type === "text" && !annotation.cellText);
        if (!staticPreview && resizable &&
            state.textSelection?.annotationId === annotation.id) {
          const aspectLocked = annotation.type === "image" ||
            (annotation.type === "formField" &&
              (annotation.fieldType === "checkbox" || annotation.fieldType === "radio"));
          const handles = aspectLocked
            ? ["top-left", "top-right", "bottom-right", "bottom-left"]
            : ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
          const screenDirections = {
            "top-left": [-1, -1], top: [0, -1], "top-right": [1, -1], right: [1, 0],
            "bottom-right": [1, 1], bottom: [0, 1], "bottom-left": [-1, 1], left: [-1, 0],
          };
          for (const corner of handles) {
            const handle = document.createElement("button");
            handle.type = "button";
            handle.className = `annotation-image-resize-handle is-${corner}`;
            handle.setAttribute("aria-label", `Resize ${annotationName(annotation)} from ${corner.replace("-", " ")}`);
            handle.addEventListener("pointerdown", (event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              const start = normalizedPoint(event, layer, page);
              const [screenX, screenY] = screenDirections[corner];
              const center = screenToBaseline({ x: 0.5, y: 0.5 }, page.rotation);
              const moving = screenToBaseline(
                { x: 0.5 + screenX * 0.5, y: 0.5 + screenY * 0.5 },
                page.rotation
              );
              const sx = Math.sign(moving.x - center.x);
              const sy = Math.sign(moving.y - center.y);
              const fixedX = sx < 0 ? annotation.x + annotation.w : sx > 0 ? annotation.x : annotation.x + annotation.w / 2;
              const fixedY = sy < 0 ? annotation.y + annotation.h : sy > 0 ? annotation.y : annotation.y + annotation.h / 2;
              objectDrag = {
                mode: "resize",
                annotation,
                page,
                mark,
                pointerId: event.pointerId,
                start,
                width: annotation.w,
                height: annotation.h,
                aspectRatio: annotation.w / annotation.h,
                aspectLocked,
                sx,
                sy,
                fixedX,
                fixedY,
                moved: false,
              };
              mark.setPointerCapture(event.pointerId);
            });
            handle.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
            });
            mark.append(handle);
          }
        }
        if (!staticPreview &&
          annotation.type === "text" &&
          annotation.formLabel &&
          state.textSelection?.annotationId === annotation.id &&
          state.annotationTool === "select"
        ) {
          const toolbar = document.createElement("div");
          toolbar.className = "free-text-toolbar";
          toolbar.setAttribute("aria-label", "Free text actions");
          const addAction = (label, glyph, callback) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "icon-btn";
            button.setAttribute("aria-label", label);
            button.title = label;
            button.innerHTML = icon(glyph);
            button.addEventListener("pointerdown", (event) => event.stopPropagation());
            button.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              callback();
            });
            toolbar.append(button);
          };
          addAction("Copy free text", "copy", () => {
            const x = Math.min(1 - annotation.w, annotation.x + 0.02);
            const y = Math.min(1 - annotation.h, annotation.y + 0.02);
            addAnnotation(page, { ...annotation, id: crypto.randomUUID(), x, y });
          });
          const color = document.createElement("input");
          color.type = "color";
          color.value = annotation.color || "#171717";
          color.setAttribute("aria-label", "Free text color");
          color.title = "Text color";
          color.addEventListener("pointerdown", (event) => event.stopPropagation());
          color.addEventListener("input", () => {
            mark.style.color = color.value;
            annotation.color = color.value;
            renderThumbnail(page);
          });
          color.addEventListener("change", () => updateAnnotation(annotation, { color: color.value }));
          toolbar.append(color);
          addAction("Add or edit link", "link", () => {
            state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
            renderInspector();
            els.textLink.click();
          });
          addAction("Delete free text", "trash", () => eraseAnnotation(page, annotation.id));
          mark.append(toolbar);
        }
        mark.addEventListener("click", (event) => {
          if (consumeSuppressedPdfTextClick(event)) return;
          if (
            textMarkupTools.has(state.annotationTool) &&
            (annotation.type === "text" || annotation.type === "text-edit")
          ) return;
          if (suppressObjectClick) {
            suppressObjectClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (state.annotationTool === "eraser") {
            event.preventDefault();
            event.stopPropagation();
            if (annotation.type !== "text" && annotation.type !== "text-edit") {
              eraseAnnotation(page, annotation.id, { eraser: true });
            }
            return;
          }
          event.stopPropagation();
          if (
            annotation.type === "text-edit" &&
            event.target instanceof Element &&
            event.target.closest(".annotation-inline-edit-text") === document.activeElement
          ) {
            return;
          }
          if (annotation.type === "text" && annotation.cellText) {
            state.textSelection = {
              pageId: page.id,
              kind: "annotation",
              annotationId: annotation.id,
            };
            renderInspector();
            return;
          }
          state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
          const activeEditable = document.activeElement;
          if (
            activeEditable instanceof HTMLElement &&
            layer.contains(activeEditable) &&
            (activeEditable.classList.contains("annotation-text-input") ||
              activeEditable.classList.contains("annotation-inline-edit-text"))
          ) {
            activeEditable.blur();
          }
          state.textSelection = { pageId: page.id, kind: "annotation", annotationId: annotation.id };
          renderInspector();
          if (layer.isConnected) renderLayer(layer, page);
          const refocus =
            annotation.type === "text-edit"
              ? state.annotationTool === "select"
                ? "annotation-inline-edit-text"
                : null
              : annotation.type === "text" &&
                  (state.annotationTool === "select" || state.annotationTool === "text")
                ? "annotation-text-input"
                : null;
          if (refocus) {
            requestAnimationFrame(() => {
              if (annotation.type === "text-edit") {
                focusEditableAtPoint(annotation.id, refocus, {
                  x: event.clientX,
                  y: event.clientY,
                });
              } else {
                focusEditable(annotation.id, refocus);
              }
            });
          }
        });
        layer.append(mark);
      }
    }
    for (const annotation of textMarks) {
      if (renderTextMark(layer, page, annotation, staticPreview)) {
        textMarkGeometryChanged = true;
      }
    }
    if (textMarkGeometryChanged && !staticPreview) renderThumbnail(page);
    if (livePath?.pageId === page.id) {
      const preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      preview.classList.add("annotation-path", "annotation-preview");
      preview.setAttribute("viewBox", "0 0 1000 1000");
      preview.setAttribute("preserveAspectRatio", "none");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute(
        "points",
        livePath.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")
      );
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", livePath.color);
      line.setAttribute("stroke-width", String(livePath.width));
      line.setAttribute("stroke-opacity", String(livePath.opacity ?? 1));
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      preview.append(line);
      layer.append(preview);
    }
    if (liveShape?.pageId === page.id) {
      const { start, current, shape } = liveShape;
      const style = shapeToolStyle(`shape-${shape}`);
      if (shape === "polyline" && liveShape.points?.length > 1) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("annotation-path", "annotation-preview");
        svg.setAttribute("viewBox", "0 0 1000 1000");
        svg.setAttribute("preserveAspectRatio", "none");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        path.setAttribute("points", liveShape.points.map((point) => {
          const display = baselineToScreen(point, page.rotation);
          return `${display.x * 1000},${display.y * 1000}`;
        }).join(" "));
        path.setAttribute("fill", "none");
        setShapeSvgStroke(path, style);
        addShapeSvgMarkers(svg, path, style);
        svg.append(path);
        layer.append(svg);
      } else if (shape === "line") {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("annotation-path", "annotation-preview");
        svg.setAttribute("viewBox", "0 0 1000 1000");
        svg.setAttribute("preserveAspectRatio", "none");
        const from = baselineToScreen(start, page.rotation);
        const to = baselineToScreen(current, page.rotation);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(from.x * 1000));
        line.setAttribute("y1", String(from.y * 1000));
        line.setAttribute("x2", String(to.x * 1000));
        line.setAttribute("y2", String(to.y * 1000));
        setShapeSvgStroke(line, style);
        addShapeSvgMarkers(svg, line, style);
        svg.append(line);
        layer.append(svg);
      } else {
        const box = projectBox(
        { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y) },
        page.rotation
        );
        const preview = document.createElement("div");
        preview.className = `annotation-mark annotation-shape annotation-shape-${shape} annotation-preview`;
        preview.style.left = `${box.x * 100}%`;
        preview.style.top = `${box.y * 100}%`;
        preview.style.width = `${box.w * 100}%`;
        preview.style.height = `${box.h * 100}%`;
        preview.style.borderColor = colorAtOpacity(style.color, style.opacity);
        preview.style.borderWidth = `${Math.max(1, style.width) * scale}px`;
        preview.style.borderStyle = style.strokeStyle === "dashed" || style.strokeStyle === "long-dash"
          ? "dashed"
          : style.strokeStyle === "dotted" || style.strokeStyle === "wavy"
            ? "dotted"
            : "solid";
        if (style.fill) preview.style.backgroundColor = colorAtOpacity(style.fill, style.fillOpacity);
        if (shape === "ellipse") preview.style.borderRadius = "50%";
        layer.append(preview);
      }
    }
  }

  async function attachPage(container, page, scale) {
    const viewer = container.closest(".viewer");
    container.addEventListener("pointerdown", (event) => {
      if (state.annotationTool !== "drag" || event.button !== 0) return;
      event.preventDefault();
      pageDrag = {
        container,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        scrollLeft: viewer.scrollLeft,
        scrollTop: viewer.scrollTop,
      };
      container.classList.add("is-panning");
      container.setPointerCapture(event.pointerId);
    });
    container.addEventListener("pointermove", (event) => {
      if (!pageDrag || pageDrag.container !== container || pageDrag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - pageDrag.x;
      const deltaY = event.clientY - pageDrag.y;
      if (Math.hypot(deltaX, deltaY) > 2) pageDrag.moved = true;
      viewer.scrollLeft = pageDrag.scrollLeft - deltaX;
      viewer.scrollTop = pageDrag.scrollTop - deltaY;
    });
    const finishPageDrag = (event) => {
      if (!pageDrag || pageDrag.container !== container || pageDrag.pointerId !== event.pointerId) return;
      const moved = pageDrag.moved;
      pageDrag = null;
      container.classList.remove("is-panning");
      if (moved) {
        suppressBackgroundClick = true;
        setTimeout(() => {
          suppressBackgroundClick = false;
        }, 0);
      }
    };
    container.addEventListener("pointerup", finishPageDrag);
    container.addEventListener("pointercancel", finishPageDrag);
    const textLayer = document.createElement("div");
    textLayer.className = "page-text-layer";
    const rotated = page.rotation % 180 !== 0;
    textLayer.style.width = `${(rotated ? page.height : page.width) * scale}px`;
    textLayer.style.height = `${(rotated ? page.width : page.height) * scale}px`;
    textLayer.style.left = "50%";
    textLayer.style.top = "50%";
    textLayer.style.transform = `translate(-50%, -50%) rotate(${page.rotation}deg)`;
    const annotationLayer = document.createElement("div");
    annotationLayer.className = "page-annotation-layer";
    container.append(textLayer, annotationLayer);

    if (page.kind === "pdf") {
      const source = state.sources.get(page.sourceId);
      const pdfPage = await source.pdf.getPage(page.index + 1);
      const operatorList = await pdfPage.getOperatorList();
      const viewport = pdfPage.getViewport({ scale, rotation: pdfPage.rotate });
      const text = await pdfPage.getTextContent();
      const textOccurrences = new Map();
      const items = [];
      text.items.forEach((item, itemIndex) => {
        if (!("str" in item) || !item.str.trim()) return;
        const occurrenceIndex = textOccurrences.get(item.str) || 0;
        textOccurrences.set(item.str, occurrenceIndex + 1);
        const box = getTextBox({ ...item, viewport }, page, scale);
        const fontMetadata = getPdfFontMetadata(pdfPage, item.fontName);
        const fontStyle = text.styles[item.fontName];
        const record = {
          id: `${itemIndex}-${item.str}`,
          textTargetId: `pdf:${page.sourceId}:${page.index}:${itemIndex}`,
          str: item.str,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          centerY: box.y + box.h / 2,
          occurrenceIndex,
          fontMetadata,
          fontStyle,
          fontSize: Math.max(6, (box.h * page.height * scale) / 1.25 / scale),
          box,
        };
        items.push(record);
      });
      const detectedGridCells = findGridCells(
        operatorList,
        pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate }),
        page
      );
      const tableCells = detectedGridCells.length
        ? assignItemsToGridCells(items, detectedGridCells)
        : findTableCells(items);
      for (const cell of tableCells) {
        for (const item of cell.items) {
          item.tableCell = cell;
        }
      }
      for (const cell of tableCells) {
        if (cell.text) continue;
        const centerX = cell.x + cell.w / 2;
        const centerY = cell.y + cell.h / 2;
        const sourceItem = items.reduce((nearest, item) => {
          const distance =
            (item.box.x + item.box.w / 2 - centerX) ** 2 +
            (item.box.y + item.box.h / 2 - centerY) ** 2;
          return !nearest || distance < nearest.distance ? { item, distance } : nearest;
        }, null)?.item;
        const hitTarget = document.createElement("span");
        hitTarget.className = "pdf-text-item pdf-cell-item";
        hitTarget.setAttribute("role", "button");
        hitTarget.setAttribute("aria-label", "Type text in empty table cell");
        hitTarget.tabIndex = 0;
        hitTarget.style.left = `${cell.x * 100}%`;
        hitTarget.style.top = `${cell.y * 100}%`;
        hitTarget.style.width = `${cell.w * 100}%`;
        hitTarget.style.height = `${cell.h * 100}%`;
        const startEditing = (event) => {
          if (state.annotationTool !== "select") return;
          event.preventDefault();
          event.stopPropagation();
          beginCellText(page, cell, sourceItem);
        };
        hitTarget.addEventListener("click", startEditing);
        hitTarget.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") startEditing(event);
        });
        textLayer.append(hitTarget);
      }
      let suppressMarkupClick = false;
      let textDrag = null;
      const finishTextDrag = (event) => {
        const drag = textDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        textDrag = null;
        drag.span.classList.remove("is-text-moving");
        document.removeEventListener("pointerup", finishTextDrag);
        document.removeEventListener("pointercancel", cancelTextDrag);

        const deltaX = event.clientX - drag.x;
        const deltaY = event.clientY - drag.y;
        const selection = window.getSelection();
        const selectedText = selection && !selection.isCollapsed
          ? selection.toString()
          : "";
        if (!drag.altKey && selectedText) {
          const selectedRange = textRangeFromSelection(
            drag.span,
            drag.span.dataset.textTargetId,
            drag.span.textContent || "",
            page.id
          );
          if (selectedRange && drag.text === drag.span.textContent) {
            const appearance = sampleTextAppearance(container.querySelector("canvas"), drag.span);
            const cell = drag.item.tableCell;
            const textBox = cell
              ? cell.textBox || cell
              : drag.item.box;
            state.textSelection = {
              pageId: page.id,
              kind: "text",
              text: selectedRange.text,
              occurrenceIndex: drag.item.occurrenceIndex,
              textTargetId: drag.item.textTargetId,
              fontSize: Math.max(6, (textBox.h * page.height * scale) / 1.25 / scale),
              fontFamily: resolveFontFamily(drag.item.fontStyle, drag.item.fontMetadata),
              fontWeight: drag.item.fontMetadata?.bold ? "bold" : "normal",
              fontStyle: drag.item.fontMetadata?.italic ? "italic" : "normal",
              sourceFontFamily: drag.item.fontStyle?.fontFamily || null,
              sourceBold: drag.item.fontMetadata?.bold ?? null,
              sourceItalic: drag.item.fontMetadata?.italic ?? null,
              fill: appearance?.fill,
              textColor: appearance?.color,
              sourceTextColor: appearance?.color || null,
              x: textBox.x,
              y: textBox.y,
              w: textBox.w,
              h: textBox.h,
            };
            state.textRangeSelection = selectedRange;
            textLayer.querySelectorAll(".is-text-selected").forEach((selected) =>
              selected.classList.remove("is-text-selected")
            );
            drag.span.classList.add("is-text-selected");
            renderInspector();
            suppressNextPdfTextClick();
            return;
          }
          if (selectedText !== drag.text.trim()) {
            suppressNextPdfTextClick();
            toast("PDF replacement covers the whole run. Click it, then select a word in the inline editor.", {
              type: "error",
            });
          }
          return;
        }
        if (Math.hypot(deltaX, deltaY) <= 3) return;
        if (state.pages.find((item) => item.id === page.id) !== page) return;

        event.preventDefault();
        event.stopPropagation();
        const angle = (page.rotation * Math.PI) / 180;
        const localDeltaX = Math.cos(angle) * deltaX + Math.sin(angle) * deltaY;
        const localDeltaY = -Math.sin(angle) * deltaX + Math.cos(angle) * deltaY;
        suppressNextPdfTextClick();
        const offset = {
          x: localDeltaX / Math.max(1, textLayer.clientWidth),
          y: localDeltaY / Math.max(1, textLayer.clientHeight),
        };
        const appearance = sampleTextAppearance(container.querySelector("canvas"), drag.span);
        const textBox = drag.item.tableCell
          ? drag.item.tableCell.textBox || drag.item.tableCell
          : drag.item.box;
        state.textSelection = {
          pageId: page.id,
          kind: "text",
          text: drag.item.tableCell?.text || drag.item.str,
          occurrenceIndex: drag.item.occurrenceIndex,
          textTargetId: drag.item.textTargetId,
          fontSize: Math.max(6, (textBox.h * page.height * scale) / 1.25 / scale),
          fontFamily: resolveFontFamily(drag.item.fontStyle, drag.item.fontMetadata),
          fontWeight: drag.item.fontMetadata?.bold ? "bold" : "normal",
          fontStyle: drag.item.fontMetadata?.italic ? "italic" : "normal",
          sourceFontFamily: drag.item.fontStyle?.fontFamily || null,
          sourceBold: drag.item.fontMetadata?.bold ?? null,
          sourceItalic: drag.item.fontMetadata?.italic ?? null,
          fill: appearance?.fill,
          textColor: appearance?.color,
          sourceTextColor: appearance?.color || null,
          x: textBox.x,
          y: textBox.y,
          w: textBox.w,
          h: textBox.h,
        };
        renderInspector();
        applyText(event, offset);
      };
      const cancelTextDrag = (event) => {
        if (!textDrag || event.pointerId !== textDrag.pointerId) return;
        textDrag.span.classList.remove("is-text-moving");
        textDrag = null;
        document.removeEventListener("pointerup", finishTextDrag);
        document.removeEventListener("pointercancel", cancelTextDrag);
      };
      textLayer.addEventListener("pointerup", () => {
        if (!textMarkupTools.has(state.annotationTool)) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
        addTextMarkupFromRange(
          page,
          selection.getRangeAt(0),
          container,
          [...textLayer.querySelectorAll(".pdf-text-item")],
          state.annotationTool
        );
        suppressMarkupClick = true;
        setTimeout(() => {
          selection.removeAllRanges();
          suppressMarkupClick = false;
        }, 0);
      });
      items.forEach((item, itemIndex) => {
        const span = document.createElement("span");
        const selectedText = item.tableCell?.text || item.str;
        const selectedBox = item.tableCell
          ? item.tableCell.textBox || item.box
          : item.box;
        const fontSize = Math.max(8, selectedBox.h * page.height * scale);
        span.className = "pdf-text-item";
        span.textContent = item.str;
        span.dataset.textTargetId = item.textTargetId;
        span.dataset.textTargetKind = "pdf";
        span.style.left = `${selectedBox.x * 100}%`;
        span.style.top = `${selectedBox.y * 100}%`;
        span.style.width = `${Math.max(selectedBox.w, 0.005) * 100}%`;
        span.style.height = `${Math.max(selectedBox.h, 0.008) * 100}%`;
        span.style.fontSize = `${fontSize}px`;
        span.dataset.pdfTextIndex = String(itemIndex);
        span.addEventListener("pointerdown", (event) => {
          if (state.annotationTool !== "select" || event.button !== 0) return;
          textDrag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            altKey: event.altKey,
            item,
            span,
            text: item.tableCell?.text || item.str,
          };
          if (event.altKey) event.preventDefault();
          document.addEventListener("pointerup", finishTextDrag);
          document.addEventListener("pointercancel", cancelTextDrag);
        });
        span.addEventListener("pointermove", (event) => {
          if (!textDrag || event.pointerId !== textDrag.pointerId) return;
          const distance = Math.hypot(event.clientX - textDrag.x, event.clientY - textDrag.y);
          if (distance > 3) span.classList.add("is-text-moving");
        });
        span.addEventListener("click", (event) => {
          if (consumeSuppressedPdfTextClick(event)) return;
          if (suppressMarkupClick) {
            event.preventDefault();
            event.stopPropagation();
            suppressMarkupClick = false;
            window.getSelection()?.removeAllRanges();
            return;
          }
          if (textMarkupTools.has(state.annotationTool)) {
            return;
          }
          if (state.annotationTool !== "select") return;
          event.stopPropagation();
          state.textRangeSelection = null;
          const appearance = sampleTextAppearance(container.querySelector("canvas"), span);
          const cell = item.tableCell;
          const textSelection = cell
            ? {
                text: cell.text,
                x: (cell.textBox || cell).x,
                y: (cell.textBox || cell).y,
                w: (cell.textBox || cell).w,
                h: (cell.textBox || cell).h,
              }
            : {
                text: item.str,
                x: item.box.x,
                y: item.box.y,
                w: item.box.w,
                h: item.box.h,
              };
          state.textSelection = {
            pageId: page.id,
            kind: "text",
            text: textSelection.text,
            occurrenceIndex: item.occurrenceIndex,
            textTargetId: item.textTargetId,
            fontSize: Math.max(6, (textSelection.h * page.height * scale) / 1.25 / scale),
            fontFamily: resolveFontFamily(item.fontStyle, item.fontMetadata),
            fontWeight: item.fontMetadata?.bold ? "bold" : "normal",
            fontStyle: item.fontMetadata?.italic ? "italic" : "normal",
            sourceFontFamily: item.fontStyle?.fontFamily || null,
            sourceBold: item.fontMetadata?.bold ?? null,
            sourceItalic: item.fontMetadata?.italic ?? null,
            fill: appearance?.fill,
            textColor: appearance?.color,
            sourceTextColor: appearance?.color || null,
            ...textSelection,
          };
          renderInspector();
          textLayer.querySelectorAll(".is-text-selected").forEach((selected) =>
            selected.classList.remove("is-text-selected")
          );
          span.classList.add("is-text-selected");
          applyText(event);
        });
        textLayer.append(span);
      });
    }

    renderLayer(annotationLayer, page);
    annotationLayer.addEventListener("pointerup", () => {
      if (!textMarkupTools.has(state.annotationTool)) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
      const targets = [
        ...annotationLayer.querySelectorAll(
          ".annotation-mark.annotation-text[data-text-target-id], .annotation-mark.annotation-inline-edit[data-text-target-id]"
        ),
      ];
      addTextMarkupFromRange(
        page,
        selection.getRangeAt(0),
        container,
        targets,
        state.annotationTool
      );
      setTimeout(() => selection.removeAllRanges(), 0);
    });
    annotationLayer.addEventListener("pointerdown", (event) => {
      if (textMarkupTools.has(state.annotationTool)) return;
      if (
        ["select", "drag", "none", "eraser", "image", "attachment"].includes(state.annotationTool) ||
        event.button !== 0
      ) return;
      event.preventDefault();
      const point = normalizedPoint(event, annotationLayer, page);
      pointer = { page, layer: annotationLayer, start: point, current: point, points: [point] };
      annotationLayer.setPointerCapture(event.pointerId);
      if (
        state.annotationTool === "draw" ||
        state.annotationTool === "signature"
      ) {
        const toolStyle = annotationToolStyle(state.annotationTool);
        livePath = {
          pageId: page.id,
          points: [baselineToScreen(point, page.rotation)],
          color: state.annotationTool === "signature" ? "#171717" : els.annotationColor.value,
          width: state.annotationTool === "signature"
            ? Number(els.annotationWidth.value) / Math.max(state.zoom, 0.25)
            : toolStyle.width / Math.max(state.zoom, 0.25),
          opacity: state.annotationTool === "signature" ? 1 : toolStyle.opacity,
        };
      } else if (
        state.annotationTool.startsWith("shape-") ||
        (state.annotationTool.startsWith("form-") && state.annotationTool !== "form-label")
      ) {
        liveShape = {
          pageId: page.id,
          shape: state.annotationTool.startsWith("shape-") ? state.annotationTool.slice("shape-".length) : "rect",
          start: point,
          current: point,
          ...(state.annotationTool === "shape-polyline" ? { points: [point] } : {}),
        };
      }
    });
    annotationLayer.addEventListener("pointermove", (event) => {
      if (!pointer || pointer.page !== page) return;
      pointer.current = normalizedPoint(event, annotationLayer, page);
      if (
        state.annotationTool === "draw" ||
        state.annotationTool === "signature"
      ) {
        pointer.points.push(pointer.current);
        livePath.points.push(baselineToScreen(pointer.current, page.rotation));
        renderLayer(annotationLayer, page);
      } else if (
        state.annotationTool.startsWith("shape-") ||
        (state.annotationTool.startsWith("form-") && state.annotationTool !== "form-label")
      ) {
        liveShape.current = pointer.current;
        if (state.annotationTool === "shape-polyline") {
          const previous = pointer.points[pointer.points.length - 1];
          if (Math.hypot(
            (pointer.current.x - previous.x) * annotationLayer.clientWidth,
            (pointer.current.y - previous.y) * annotationLayer.clientHeight
          ) > 2) pointer.points.push(pointer.current);
          liveShape.points = pointer.points;
        }
        renderLayer(annotationLayer, page);
      }
    });
    annotationLayer.addEventListener("pointerup", () => {
      if (!pointer || pointer.page !== page) return;
      const finished = pointer;
      pointer = null;
      const x = Math.min(finished.start.x, finished.current.x);
      const y = Math.min(finished.start.y, finished.current.y);
      const w = Math.abs(finished.current.x - finished.start.x);
      const h = Math.abs(finished.current.y - finished.start.y);
      if (state.annotationTool === "stamp-place" && activeStamp) {
        liveShape = null;
        addStamp(activeStamp.label, finished.start, activeStamp);
      } else if (state.annotationTool === "signature-place") {
        liveShape = null;
        placeSavedSignature(finished.start);
      } else if (
        (state.annotationTool === "draw" || state.annotationTool === "signature") &&
        finished.points.length > 1
      ) {
        livePath = null;
        addAnnotation(page, {
          id: crypto.randomUUID(),
          type: "draw",
          points: finished.points,
          signature: state.annotationTool === "signature",
          tool: state.annotationTool,
          color: state.annotationTool === "signature" ? "#171717" : els.annotationColor.value,
          width: state.annotationTool === "signature"
            ? Number(els.annotationWidth.value) / Math.max(state.zoom, 0.25)
            : annotationToolStyle("draw").width / Math.max(state.zoom, 0.25),
          opacity: state.annotationTool === "signature" ? 1 : annotationToolStyle("draw").opacity,
        });
      } else if (state.annotationTool.startsWith("shape-") &&
        (state.annotationTool === "shape-polyline"
          ? finished.points.length > 1
          : Math.hypot(finished.current.x - finished.start.x, finished.current.y - finished.start.y) > 0.002)) {
        const shape = state.annotationTool.slice("shape-".length);
        const style = shapeToolStyle(state.annotationTool);
        const points = shape === "polyline" ? finished.points : null;
        const shapeX = points ? Math.min(...points.map((point) => point.x)) : x;
        const shapeY = points ? Math.min(...points.map((point) => point.y)) : y;
        const shapeW = points ? Math.max(...points.map((point) => point.x)) - shapeX : w;
        const shapeH = points ? Math.max(...points.map((point) => point.y)) - shapeY : h;
        liveShape = null;
        addAnnotation(page, {
          id: crypto.randomUUID(),
          type: "shape",
          shape,
          ...(points ? { points } : {}),
          x: shape === "line" ? finished.start.x : shapeX,
          y: shape === "line" ? finished.start.y : shapeY,
          w: shape === "line" ? finished.current.x - finished.start.x : shapeW,
          h: shape === "line" ? finished.current.y - finished.start.y : shapeH,
          color: style.color,
          width: style.width,
          opacity: style.opacity,
          strokeStyle: style.strokeStyle,
          fill: style.fill,
          fillOpacity: style.fillOpacity,
          startMarker: style.startMarker,
          endMarker: style.endMarker,
        });
      } else if (state.annotationTool.startsWith("form-") && state.annotationTool !== "form-label") {
        const fieldType = state.annotationTool.slice("form-".length);
        const defaults = formToolDefaults[state.annotationTool];
        const dragWidth = Math.abs(finished.current.x - finished.start.x);
        const dragHeight = Math.abs(finished.current.y - finished.start.y);
        const dragged = Math.hypot(
          dragWidth * annotationLayer.clientWidth,
          dragHeight * annotationLayer.clientHeight
        ) > 8;
        const defaultWidth = Math.min(0.95, defaults.width / page.width);
        const defaultHeight = Math.min(0.95, defaults.height / page.height);
        const placedWidth = dragged ? dragWidth : defaultWidth;
        const placedHeight = dragged ? dragHeight : defaultHeight;
        const squareField = fieldType === "checkbox" || fieldType === "radio";
        const boxSize = squareField
          ? Math.max(0.008, dragged ? Math.max(placedWidth, placedHeight) : Math.min(defaultWidth, defaultHeight))
          : null;
        const fieldWidth = boxSize || Math.max(0.008, placedWidth);
        const fieldHeight = boxSize || Math.max(0.008, placedHeight);
        const x = Math.max(0, Math.min(1 - fieldWidth, dragged
          ? Math.min(finished.start.x, finished.current.x)
          : finished.start.x));
        const y = Math.max(0, Math.min(1 - fieldHeight, dragged
          ? Math.min(finished.start.y, finished.current.y)
          : finished.start.y));
        addAnnotation(page, {
          id: crypto.randomUUID(),
          type: "formField",
          fieldType,
          x,
          y,
          w: fieldWidth,
          h: fieldHeight,
          color: els.formFieldColor.value,
          defaultValue: defaults.value || "",
          readOnly: Boolean(defaults.readOnly),
          required: Boolean(defaults.required),
          multiline: Boolean(defaults.multiline),
          multiSelect: Boolean(defaults.multiSelect),
          indicator: Boolean(defaults.indicator),
          options: [...(defaults.options || [])],
        });
      } else if (state.annotationTool === "text") {
        livePath = null;
        addTextAtPoint(page, annotationLayer, finished.start);
      } else if (state.annotationTool === "comment") {
        livePath = null;
        addTextAtPoint(page, annotationLayer, finished.start, true, "Comment", { comment: true });
      } else if (state.annotationTool === "form-label") {
        livePath = null;
        addTextAtPoint(page, annotationLayer, finished.start, true, "Insert text here", { formLabel: true });
      }
      if (livePath) {
        livePath = null;
        renderLayer(annotationLayer, page);
      }
      if (liveShape) {
        liveShape = null;
        renderLayer(annotationLayer, page);
      }
    });
  }

  function updateAnnotation(annotation, patch) {
    const page = currentPage();
    if (!page || !annotation) return;
    const updated = { ...annotation, ...patch };
    const hasTextPatch = Object.prototype.hasOwnProperty.call(patch, "text");
    const clearsText = hasTextPatch && patch.text === "";
    const target = annotation.type === "text"
      ? { kind: "annotation", id: annotation.id }
      : annotation.type === "text-edit" && annotation.sourceTextId
        ? { kind: "pdf", id: annotation.sourceTextId }
        : null;
    const remappedRanges = hasTextPatch && annotation.type === "text-edit" &&
        annotation.sourceTextId && typeof patch.text === "string"
      ? (() => {
          const ranges = page.formattingRanges || [];
          const targetRanges = ranges.filter(
            (range) => range.textTargetId === annotation.sourceTextId
          );
          if (!targetRanges.length) return null;
          const oldText = targetRanges[0].text || annotation.text;
          return {
            oldText,
            ranges: remapFormattingRanges(
              oldText,
              patch.text,
              targetRanges.map(({ start, end, style }) => ({ start, end, style }))
            ),
          };
        })()
      : null;
    const selectedRange = state.textRangeSelection;
    const remappedSelection = hasTextPatch &&
        annotation.type === "text-edit" &&
        annotation.sourceTextId &&
        typeof patch.text === "string" &&
        selectedRange?.textTargetId === annotation.sourceTextId &&
        selectedRange.text === annotation.text
      ? remapTextRange(annotation.text, patch.text, selectedRange)
      : null;
    if (hasTextPatch && patch.text) refreshAttachedTextMarks(page, target, updated);
    commit(() => {
      const deletedTextTarget = clearsText
        ? annotation.type === "text"
          ? { kind: "annotation", id: annotation.id }
          : annotation.type === "text-edit" && annotation.sourceTextId
            ? { kind: "pdf", id: annotation.sourceTextId }
            : null
        : null;
      page.annotations = page.annotations
        .map((item) => (item.id === annotation.id ? updated : item))
        .filter((item) =>
          !(deletedTextTarget && isTextMarkAnnotation(item) &&
            item.textTarget?.kind === deletedTextTarget.kind &&
            item.textTarget.id === deletedTextTarget.id)
        );
      if (remappedRanges) {
        page.formattingRanges = [
          ...(page.formattingRanges || []).filter(
            (range) => range.textTargetId !== annotation.sourceTextId
          ),
          ...remappedRanges.ranges.map((range) => ({
            ...range,
            textTargetId: annotation.sourceTextId,
            text: patch.text,
          })),
        ];
      }
      if (remappedSelection) {
        state.textRangeSelection = {
          ...selectedRange,
          text: patch.text,
          start: remappedSelection.start,
          end: remappedSelection.end,
        };
      } else if (
        hasTextPatch &&
        annotation.type === "text-edit" &&
        annotation.sourceTextId &&
        selectedRange?.textTargetId === annotation.sourceTextId &&
        selectedRange?.text === annotation.text
      ) {
        state.textRangeSelection = null;
      }
      state.textSelection = { pageId: page.id, kind: "annotation", annotationId: updated.id };
    });
    renderInspector();
  }

  async function updateFormattingRange(style) {
    const selection = activeFormattingRange();
    if (!selection) return;
    const page = state.pages.find((item) => item.id === selection.pageId);
    if (!page) return;
    let textEdit = page.annotations?.find(
      (item) => item.type === "text-edit" && item.sourceTextId === selection.textTargetId
    );
    if (!textEdit && state.textSelection?.kind === "text" &&
        state.textSelection.textTargetId === selection.textTargetId) {
      const source = state.textSelection;
      textEdit = {
        id: crypto.randomUUID(),
        type: "text-edit",
        x: source.x,
        y: source.y,
        w: source.w,
        h: source.h,
        text: source.text,
        color: source.textColor || "#171717",
        fill: source.fill,
        fontSize: source.fontSize,
        fontFamily: source.fontFamily,
        fontWeight: source.fontWeight,
        fontStyle: source.fontStyle,
        sourceFontFamily: source.sourceFontFamily,
        sourceBold: source.sourceBold,
        sourceItalic: source.sourceItalic,
        sourceTextColor: source.sourceTextColor,
        originalText: source.text,
        occurrenceIndex: source.occurrenceIndex,
        sourceTextId: selection.textTargetId,
      };
      const validationError = await textEditValidationError(page, textEdit);
      if (activeFormattingRange() !== selection || !state.pages.includes(page)) return;
      if (validationError) {
        toast(`This character formatting cannot be exported safely: ${validationError}`, { type: "error" });
        return;
      }
    }
    const existing = page.formattingRanges || [];
    const targetRanges = rangesForTarget(selection.pageId, selection.textTargetId);
    const nextRanges = applyFormattingRange(
      selection.text,
      targetRanges,
      selection.start,
      selection.end,
      style
    );
    commit(() => {
      if (textEdit && !page.annotations?.some((item) => item.id === textEdit.id)) {
        page.annotations = [...(page.annotations || []), textEdit];
      }
      page.formattingRanges = [
        ...existing.filter((range) => range.textTargetId !== selection.textTargetId),
        ...nextRanges.map((range) => ({
          ...range,
          textTargetId: selection.textTargetId,
          text: selection.text,
        })),
      ];
    }, { render: false });
    const annotation = page.annotations?.find(
      (item) => item.type === "text-edit" && item.sourceTextId === selection.textTargetId
    );
    const pageElement = [...els.pages.children].find(
      (element) => element.dataset.id === selection.pageId
    );
    const textContent = annotation && pageElement
      ? [...pageElement.querySelectorAll(".annotation-inline-edit[data-text-target-id]")]
          .find((mark) => mark.dataset.textTargetId === selection.textTargetId)
          ?.querySelector(".annotation-inline-edit-text")
      : null;
    if (textContent) {
      renderFormattedText(
        textContent,
        annotation.text,
        nextRanges,
        state.zoom,
        { start: selection.start, end: selection.end }
      );
    }
    renderInspector();
  }

  function currentRangeStyle() {
    const selection = activeFormattingRange();
    if (!selection) return {};
    return styleForTextRange(
      rangesForTarget(selection.pageId, selection.textTargetId),
      selection.start,
      selection.end
    );
  }

  document.getElementById("pdf-range-font-family").addEventListener("change", (event) => {
    updateFormattingRange({ fontFamily: event.currentTarget.value });
  });
  document.getElementById("pdf-range-font-size").addEventListener("change", (event) => {
    const input = event.currentTarget;
    if (!input.reportValidity()) return;
    updateFormattingRange({ fontSize: Number(input.value) });
  });
  document.getElementById("pdf-range-bold").addEventListener("click", () => {
    const style = currentRangeStyle();
    const source = state.textRangeSelection && formattingSource(state.textRangeSelection);
    updateFormattingRange({
      bold: !(style.bold ?? (source?.sourceBold === true || source?.fontWeight === "bold")),
    });
  });
  document.getElementById("pdf-range-italic").addEventListener("click", () => {
    const style = currentRangeStyle();
    const source = state.textRangeSelection && formattingSource(state.textRangeSelection);
    updateFormattingRange({
      italic: !(style.italic ?? (source?.sourceItalic === true || source?.fontStyle === "italic")),
    });
  });
  document.getElementById("pdf-range-color").addEventListener("change", (event) => {
    updateFormattingRange({ color: event.currentTarget.value });
  });

  async function textEditValidationError(page, annotation) {
    const finishBusy = beginBusy("Checking in-place text edit…");
    try {
      let formattingRanges = page.formattingRanges || [];
      if (
        annotation.type === "text-edit" &&
        annotation.sourceTextId &&
        typeof annotation.text === "string"
      ) {
        const targetRanges = formattingRanges.filter(
          (range) => range.textTargetId === annotation.sourceTextId
        );
        const existingEdit = page.annotations?.find(
          (item) =>
            item.type === "text-edit" &&
            item.sourceTextId === annotation.sourceTextId
        );
        const oldText = targetRanges[0]?.text || existingEdit?.text;
        if (targetRanges.length && oldText && oldText !== annotation.text) {
          formattingRanges = [
            ...formattingRanges.filter(
              (range) => range.textTargetId !== annotation.sourceTextId
            ),
            ...remapFormattingRanges(
              oldText,
              annotation.text,
              targetRanges.map(({ start, end, style }) => ({ start, end, style }))
            ).map((range) => ({
              ...range,
              textTargetId: annotation.sourceTextId,
              text: annotation.text,
            })),
          ];
        }
      }
      const candidate = {
        ...page,
        formattingRanges,
        annotations: [
          ...(page.annotations || []).filter((item) => item.id !== annotation.id),
          annotation,
        ],
      };
      await validateTextEdit(candidate, state.sources, annotation.id);
      return null;
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "The in-place text edit could not be validated.";
    } finally {
      finishBusy();
    }
  }

  async function applyText(event = null, moveOffset = null) {
    const selection = state.textSelection;
    const page = currentPage();
    const text = els.selectedText.value;
    if (selection?.kind === "text" && page) {
      const existingEdit = page.annotations?.find(
        (annotation) =>
          annotation.type === "text-edit" &&
          annotation.originalText === selection.text &&
          annotation.occurrenceIndex === selection.occurrenceIndex
      );
      if (existingEdit) {
        const selectedEdit = {
          pageId: page.id,
          kind: "annotation",
          annotationId: existingEdit.id,
        };
        if (moveOffset) {
          commit(() => {
            page.annotations = page.annotations.map((annotation) =>
              annotation.id === existingEdit.id
                ? {
                    ...annotation,
                    moveX: (annotation.moveX || 0) + moveOffset.x,
                    moveY: (annotation.moveY || 0) + moveOffset.y,
                  }
                : annotation
            );
            state.textSelection = selectedEdit;
          });
        } else {
          state.textSelection = selectedEdit;
        }
        renderInspector();
        if (event && !moveOffset) {
          focusEditableAtPoint(existingEdit.id, "annotation-inline-edit-text", {
            x: event.clientX,
            y: event.clientY,
          });
        }
        return;
      }
      const annotation = {
        id: crypto.randomUUID(),
        type: "text-edit",
        x: selection.x,
        y: selection.y,
        w: selection.w,
        h: selection.h,
        text,
        color: selection.textColor || "#171717",
        fill: selection.fill,
        fontSize: selection.fontSize,
        fontFamily: selection.fontFamily,
        fontWeight: selection.fontWeight,
        fontStyle: selection.fontStyle,
        sourceFontFamily: selection.sourceFontFamily,
        sourceBold: selection.sourceBold,
        sourceItalic: selection.sourceItalic,
        sourceTextColor: selection.sourceTextColor,
        originalText: selection.text,
        occurrenceIndex: selection.occurrenceIndex,
        ...(selection.textTargetId ? { sourceTextId: selection.textTargetId } : {}),
        ...(moveOffset
          ? { moveX: moveOffset.x, moveY: moveOffset.y }
          : {}),
      };
      const validationError = await textEditValidationError(page, annotation);
      if (validationError) annotation.validationError = validationError;
      addAnnotation(page, annotation);
      if (event && !moveOffset) {
        requestAnimationFrame(() =>
          focusEditableAtPoint(annotation.id, "annotation-inline-edit-text", {
            x: event.clientX,
            y: event.clientY,
          })
        );
      } else if (!moveOffset) {
        requestAnimationFrame(() =>
          focusEditable(annotation.id, "annotation-inline-edit-text")
        );
      }
      if (validationError) {
        toast(`This in-place text edit cannot be exported yet: ${validationError}`, { type: "error" });
      } else {
        toast(
          moveOffset
            ? "Moved the selected PDF text. Download the PDF to keep the new position."
            : "Type at the clicked position. The original line width is preserved."
        );
      }
      return;
    }
    const annotation = activeAnnotation();
    if (annotation?.type !== "text" && annotation?.type !== "text-edit") return;
    updateAnnotation(annotation, { text: els.selectedText.value });
  }

  function clearSelection() {
    const selection = state.textSelection;
    state.textSelection = null;
    state.textRangeSelection = null;
    if (selection) {
      const page = state.pages.find((item) => item.id === selection.pageId);
      const pageElement = [...els.pages.children].find(
        (element) => element.dataset.id === selection.pageId
      );
      pageElement?.querySelector(".page-text-layer .is-text-selected")?.classList.remove("is-text-selected");
      const layer = pageElement?.querySelector(".page-annotation-layer");
      if (page && layer) renderLayer(layer, page);
    }
    renderInspector();
  }

  els.viewer.addEventListener("click", (event) => {
    if (
      !state.textSelection ||
      !["select", "drag"].includes(state.annotationTool) ||
      event.defaultPrevented
    ) return;
    if (suppressBackgroundClick) {
      suppressBackgroundClick = false;
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest(
        ".annotation-mark, .annotation-hit-line, .annotation-select-frame, .annotation-image-resize-handle, input, textarea, select, button, a, [contenteditable=\"true\"]"
      ) ||
      (state.annotationTool === "select" && target.closest(".pdf-text-item"))
    ) return;
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement.isContentEditable || activeElement.matches("input, textarea, select"))
    ) return;
    clearSelection();
  });

  function updateSelectedText(patch) {
    const annotation = activeAnnotation();
    if (annotation?.type === "text") updateAnnotation(annotation, patch);
    else if (state.annotationTool === "text") {
      Object.assign(textInsertDefaults, patch);
      if (patch.color) annotationToolStyle("text").color = patch.color;
      if (patch.opacity != null) annotationToolStyle("text").opacity = patch.opacity;
      if (patch.strokeWidth != null) annotationToolStyle("text").width = patch.strokeWidth;
      renderTextOptions();
      renderAnnotationToolOptions();
    }
  }

  function updateAnnotationToolStyle(patch) {
    const context = annotationToolContext();
    if (!context) return;
    const annotationPatch = context.tool === "text" && patch.width != null
      ? { ...patch, strokeWidth: patch.width }
      : patch;
    if (context.tool === "text" && patch.width != null) delete annotationPatch.width;
    if (context.selected) updateAnnotation(context.selected, annotationPatch);
    else {
      Object.assign(annotationToolStyle(context.tool), patch);
      if (context.tool === "text") {
        if (patch.color) textInsertDefaults.color = patch.color;
        if (patch.opacity != null) textInsertDefaults.opacity = patch.opacity;
        if (patch.width != null) textInsertDefaults.strokeWidth = patch.width;
      }
    }
    if (patch.color) {
      els.annotationColor.value = patch.color;
      document.getElementById("annotation-tool-color").value = patch.color;
      document.querySelectorAll("[data-edit-annotation-color]").forEach((input) => {
        input.value = patch.color;
      });
    }
    if (context.tool === "text" && !context.selected) renderTextOptions();
    renderAnnotationToolOptions();
  }

  function updateShapeToolStyle(patch) {
    const context = shapeToolContext();
    if (!context) return;
    if (context.selected) updateAnnotation(context.selected, patch);
    else Object.assign(shapeToolStyle(context.tool), patch);
    renderShapeToolOptions();
  }

  for (const colorKind of ["stroke", "fill"]) {
    const palette = document.getElementById(`shape-${colorKind}-palette`);
    palette.addEventListener("click", (event) => {
      if (colorKind === "fill" && event.target.closest("[data-shape-fill-clear]")) {
        updateShapeToolStyle({ fill: null });
        return;
      }
      const colorButton = event.target.closest(
        `[data-shape-${colorKind}-preset], [data-shape-${colorKind}-custom]`
      );
      if (!colorButton) return;
      const color = colorButton.getAttribute(`data-shape-${colorKind}-preset`) ||
        colorButton.getAttribute(`data-shape-${colorKind}-custom`);
      if (colorKind === "stroke") updateShapeToolStyle({ color });
      else updateShapeToolStyle({ fill: color });
    });
    document.getElementById(`shape-${colorKind}-color`).addEventListener("change", (event) => {
      const color = event.currentTarget.value;
      if (colorKind === "stroke") updateShapeToolStyle({ color });
      else updateShapeToolStyle({ fill: color });
    });
    document.getElementById(`shape-${colorKind}-add-color`).addEventListener("click", () => {
      const color = document.getElementById(`shape-${colorKind}-color`).value.toLowerCase();
      const colors = colorKind === "stroke" ? customShapeStrokeColors : customShapeFillColors;
      if (!colors.includes(color)) colors.push(color);
      renderShapeToolOptions();
    });
    document.getElementById(`shape-${colorKind}-remove-color`).addEventListener("click", () => {
      const colors = colorKind === "stroke" ? customShapeStrokeColors : customShapeFillColors;
      colors.pop();
      renderShapeToolOptions();
    });
    document.getElementById(`shape-${colorKind}-copy-color`).addEventListener("click", async () => {
      const color = document.getElementById(`shape-${colorKind}-color`).value;
      try {
        await navigator.clipboard.writeText(color);
        toast(`Copied ${color}.`);
      } catch {
        toast("Clipboard access is unavailable in this browser.", { type: "error" });
      }
    });
    document.getElementById(`shape-${colorKind}-palette-toggle`).addEventListener("click", (event) => {
      const expanded = palette.classList.toggle("is-expanded");
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
      event.currentTarget.textContent = expanded ? "Show Less" : "Show More";
    });
  }
  document.getElementById("shape-stroke-width").addEventListener("change", (event) => {
    updateShapeToolStyle({ width: Number(event.currentTarget.value) });
  });
  document.getElementById("shape-stroke-opacity").addEventListener("change", (event) => {
    updateShapeToolStyle({ opacity: Number(event.currentTarget.value) / 100 });
  });
  document.getElementById("shape-fill-opacity").addEventListener("change", (event) => {
    updateShapeToolStyle({ fillOpacity: Number(event.currentTarget.value) / 100 });
  });
  document.getElementById("shape-stroke-style").addEventListener("change", (event) => {
    updateShapeToolStyle({ strokeStyle: event.currentTarget.value });
  });
  document.getElementById("shape-start-marker").addEventListener("change", (event) => {
    updateShapeToolStyle({ startMarker: event.currentTarget.value });
  });
  document.getElementById("shape-end-marker").addEventListener("change", (event) => {
    updateShapeToolStyle({ endMarker: event.currentTarget.value });
  });
  document.querySelectorAll("[data-edit-annotation-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const context = shapeToolContext();
      if (context && !context.selected) shapeToolStyle(context.tool).color = input.value;
      renderShapeToolOptions();
    });
    input.addEventListener("change", () => {
      const context = shapeToolContext();
      if (context?.selected) updateAnnotation(context.selected, { color: input.value });
    });
  });

  document.getElementById("annotation-color-palette").addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-annotation-preset], [data-custom-annotation-color]");
    if (!swatch) return;
    updateAnnotationToolStyle({ color: swatch.dataset.annotationPreset || swatch.dataset.customAnnotationColor });
  });
  document.getElementById("annotation-tool-color").addEventListener("change", (event) => {
    updateAnnotationToolStyle({ color: event.currentTarget.value });
  });
  document.getElementById("annotation-add-color").addEventListener("click", () => {
    const color = document.getElementById("annotation-tool-color").value.toLowerCase();
    if (!customAnnotationColors.includes(color)) customAnnotationColors.push(color);
    renderAnnotationPalette();
  });
  document.getElementById("annotation-remove-color").addEventListener("click", () => {
    customAnnotationColors.pop();
    renderAnnotationPalette();
  });
  document.getElementById("annotation-palette-toggle").addEventListener("click", (event) => {
    const palette = document.getElementById("annotation-color-palette");
    const expanded = palette.classList.toggle("is-expanded");
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    event.currentTarget.textContent = expanded ? "Show Less" : "Show More";
  });
  document.getElementById("annotation-opacity").addEventListener("change", (event) => {
    updateAnnotationToolStyle({ opacity: Number(event.currentTarget.value) / 100 });
  });
  document.getElementById("annotation-tool-width").addEventListener("change", (event) => {
    updateAnnotationToolStyle({ width: Number(event.currentTarget.value) });
  });
  document.querySelectorAll("[data-edit-annotation-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const context = annotationToolContext();
      if (context && !context.selected) annotationToolStyle(context.tool).color = input.value;
      els.annotationColor.value = input.value;
      document.getElementById("annotation-tool-color").value = input.value;
      renderAnnotationPalette();
    });
    input.addEventListener("change", () => {
      const context = annotationToolContext();
      if (context?.selected) updateAnnotation(context.selected, { color: input.value });
    });
  });

  els.applyText.addEventListener("click", applyText);
  els.clearTextSelection.addEventListener("click", clearSelection);
  els.textFont.addEventListener("change", () => updateSelectedText({ fontFamily: els.textFont.value }));
  els.textSize.addEventListener("change", () => updateSelectedText({ fontSize: Number(els.textSize.value) }));
  els.textColor.addEventListener("input", () => updateSelectedText({ color: els.textColor.value }));
  els.customTextColor.addEventListener("input", () => {
    els.textColor.value = els.customTextColor.value;
    updateSelectedText({ color: els.customTextColor.value });
  });
  document.querySelectorAll("[data-text-format]").forEach((button) => {
    button.addEventListener("click", () => {
      const annotation = activeAnnotation();
      if (annotation?.type !== "text" && state.annotationTool !== "text") return;
      const property = {
        bold: "fontWeight",
        italic: "fontStyle",
        underline: "underline",
        strike: "strike",
      }[button.dataset.textFormat];
      const active = button.getAttribute("aria-pressed") === "true";
      const value = property === "fontWeight"
        ? active ? "normal" : "bold"
        : property === "fontStyle"
          ? active ? "normal" : "italic"
          : !active;
      updateSelectedText({ [property]: value });
    });
  });
  document.querySelectorAll("[data-text-align]").forEach((button) => {
    button.addEventListener("click", () => updateSelectedText({ align: button.dataset.textAlign }));
  });
  document.querySelectorAll("[data-text-valign]").forEach((button) => {
    button.addEventListener("click", () => updateSelectedText({ verticalAlign: button.dataset.textValign }));
  });
  document.getElementById("text-auto-fit").addEventListener("change", (event) => {
    updateSelectedText({ autoFit: event.currentTarget.checked });
  });
  textOptionsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setTool("text");
    textOptionsMenu.hidden = !textOptionsMenu.hidden;
    textOptionsToggle.setAttribute("aria-expanded", String(!textOptionsMenu.hidden));
    if (!textOptionsMenu.hidden) {
      renderTextOptions();
      positionTextOptions();
    }
    syncToolOptionsRow();
  });
  window.addEventListener("resize", () => {
    if (!textOptionsMenu.hidden) positionTextOptions();
  });
  document.getElementById("insert-text-font").addEventListener("change", (event) =>
    updateInsertTextStyle({ fontFamily: event.target.value })
  );
  document.getElementById("insert-text-size").addEventListener("change", (event) =>
    updateInsertTextStyle({ fontSize: Number(event.target.value) })
  );
  document.getElementById("insert-text-color").addEventListener("input", (event) =>
    updateInsertTextStyle({ color: event.target.value })
  );
  document.getElementById("insert-text-fill-enabled").addEventListener("change", (event) => {
    const fill = event.target.checked
      ? document.getElementById("insert-text-fill").value
      : null;
    updateInsertTextStyle({ fill });
  });
  document.getElementById("insert-text-fill").addEventListener("input", (event) =>
    updateInsertTextStyle({ fill: event.target.value })
  );
  document.getElementById("insert-text-align").addEventListener("change", (event) =>
    updateInsertTextStyle({ align: event.target.value })
  );
  document.querySelectorAll("[data-insert-format]").forEach((button) => {
    button.addEventListener("click", () => {
      const annotation = activeAnnotation();
      const values = annotation?.type === "text" ? annotation : textInsertDefaults;
      const active = button.getAttribute("aria-pressed") === "true";
      const patch = button.dataset.insertFormat === "bold"
        ? { fontWeight: active ? "normal" : "bold" }
        : button.dataset.insertFormat === "italic"
          ? { fontStyle: active ? "normal" : "italic" }
          : { underline: !values.underline };
      updateInsertTextStyle(patch);
    });
  });
  els.textLink.addEventListener("click", () => {
    const annotation = activeAnnotation();
    if (annotation?.type !== "text") return;
    els.textUrl.value = annotation.link || "";
    els.textLinkEditor.hidden = !els.textLinkEditor.hidden;
    if (!els.textLinkEditor.hidden) els.textUrl.focus();
  });
  els.applyTextLink.addEventListener("click", () => {
    const url = els.textUrl.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast("Links must start with http:// or https://.", { type: "error" });
      return;
    }
    updateSelectedText({ link: url });
    els.textLinkEditor.hidden = true;
  });
  els.textUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.applyTextLink.click();
    }
  });
  els.clearTextLink.addEventListener("click", () => {
    updateSelectedText({ link: null });
    els.textUrl.value = "";
    els.textLinkEditor.hidden = true;
  });
  els.removeAllAnnotations.addEventListener("click", () => {
    const page = state.pages.find((item) => item.id === state.currentId) || state.pages[0];
    if (!page?.annotations?.length) return;
    commit(() => {
      const removedTextIds = new Set(
        page.annotations
          .filter((annotation) => annotation.type === "text")
          .map((annotation) => annotation.id)
      );
      page.annotations = page.annotations.filter((annotation) =>
        isTextMarkAnnotation(annotation)
          ? annotation.textTarget?.kind !== "annotation" ||
            !removedTextIds.has(annotation.textTarget.id)
          : false
      );
      state.textSelection = null;
    });
    renderInspector();
  });
  document.getElementById("insert-image-file").addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    setTool("drag");
    if (file) addImage(file);
    event.target.value = "";
  });
  document.getElementById("insert-image-file").addEventListener("cancel", () => setTool("drag"));
  const attachmentInput = document.getElementById("insert-attachment-file");
  attachmentInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    setTool("drag");
    if (file) addAttachment(file);
    event.target.value = "";
  });
  attachmentInput.addEventListener("cancel", () => setTool("drag"));
  document.querySelectorAll("[data-annotation-tool]:not([data-annotation-tool=\"text\"])").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.dataset.annotationTool === "image") {
        setTool("image");
        document.getElementById("insert-image-file").click();
        return;
      }
      setTool(button.dataset.annotationTool);
    });
  });
  setTool("drag");
  renderInspector();

  return { attachPage, renderLayer, renderInspector, setTool, addStamp };
}

export function baselinePointToPdf(point, baseRotation, width, height) {
  switch (baseRotation % 360) {
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

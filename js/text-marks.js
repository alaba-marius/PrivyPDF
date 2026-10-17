import {
  formattingTextSegments,
  standardPdfFontKey,
} from "./text-ranges.js";

export const TEXT_MARK_TOOLS = Object.freeze([
  "highlight",
  "annotate-underline",
  "annotate-squiggle",
  "annotate-strike",
]);

export function isTextMarkAnnotation(annotation) {
  return Boolean(
    annotation &&
      (annotation.textMark === true ||
        annotation.type === "highlight" ||
        (annotation.type === "draw" && TEXT_MARK_TOOLS.includes(annotation.tool)))
  );
}

export function hasCompatibleSingleBaselineRects(rects) {
  if (!Array.isArray(rects) || !rects.length) return false;
  let minHeight = Infinity;
  let minCenter = Infinity;
  let maxCenter = -Infinity;
  for (const rect of rects) {
    if (
      !Number.isFinite(rect?.left) ||
      !Number.isFinite(rect?.right) ||
      rect.right <= rect.left ||
      !Number.isFinite(rect?.top) ||
      !Number.isFinite(rect?.bottom) ||
      rect.bottom <= rect.top
    ) {
      return false;
    }
    const center = (rect.top + rect.bottom) / 2;
    minCenter = Math.min(minCenter, center);
    maxCenter = Math.max(maxCenter, center);
    minHeight = Math.min(minHeight, rect.bottom - rect.top);
  }
  const tolerance = Math.max(1, minHeight * 0.1);
  return maxCenter - minCenter <= tolerance;
}

export function canUseStrikeSelectionMetrics({
  segmentCount,
  rectangleCount,
  candidateCount,
  targetId,
  targetKind,
  strikeMetrics,
  rects,
}) {
  if (segmentCount === 1) return true;
  return segmentCount > 1 &&
    segmentCount === rectangleCount &&
    candidateCount === 1 &&
    Boolean(targetId) &&
    ["pdf", "annotation"].includes(targetKind) &&
    Boolean(strikeMetrics) &&
    hasCompatibleSingleBaselineRects(rects);
}

export function fontMetricStrikeCenterY({
  baselineY,
  fontSize,
  ascent,
  descent,
  verticalDirection,
  pageHeight,
}) {
  if (
    !Number.isFinite(baselineY) ||
    !Number.isFinite(fontSize) ||
    fontSize <= 0 ||
    !Number.isFinite(ascent) ||
    ascent <= 0 ||
    !Number.isFinite(descent) ||
    ascent <= descent ||
    ![-1, 1].includes(verticalDirection) ||
    !Number.isFinite(pageHeight) ||
    pageHeight <= 0
  ) {
    return null;
  }
  const centerY = (
    baselineY + verticalDirection * ascent * fontSize * 0.5
  ) / pageHeight;
  return centerY >= 0 && centerY <= 1 ? centerY : null;
}

function textStrikeMetrics(annotation, formattingRanges) {
  const metrics = annotation?.strikeMetrics;
  if (!metrics || !Array.isArray(formattingRanges)) return null;
  const targetId = annotation.textTarget?.id;
  const textRange = annotation.textRange;
  const ranges = formattingRanges.filter(
    (range) =>
      (range.textTargetId == null || range.textTargetId === targetId) &&
      typeof range.text === "string"
  );
  let fontFamily = metrics.fontFamily;
  let fontSize = metrics.fontSize;
  let bold = metrics.bold === true;
  let italic = metrics.italic === true;
  let text = annotation.textTargetText;
  if (
    !Number.isInteger(textRange?.start) ||
    !Number.isInteger(textRange?.end) ||
    textRange.start < 0 ||
    textRange.end <= textRange.start
  ) return null;
  if (!ranges.length) {
    if (typeof text !== "string" || textRange.end > text.length) return null;
    return {
      ...metrics,
      fontFamily,
      fontSize,
      bold,
      italic,
      text: text.slice(textRange.start, textRange.end),
    };
  }
  text = ranges[0].text;
  if (
    ranges.some((range) => range.text !== text) ||
    textRange.end > text.length
  ) return null;
  let resolvedStyle = null;
  for (const segment of formattingTextSegments(text, ranges)) {
    if (segment.end <= textRange.start || segment.start >= textRange.end) continue;
    const style = segment.style || {};
    const family = style.fontFamily || metrics.fontFamily;
    if (!standardPdfFontKey(family, false, false)) return null;
    const nextStyle = {
      fontFamily: family,
      fontSize: style.fontSize ?? metrics.fontSize,
      bold: style.bold ?? (metrics.bold === true),
      italic: style.italic ?? (metrics.italic === true),
    };
    if (!Number.isFinite(nextStyle.fontSize) || nextStyle.fontSize <= 0) return null;
    if (
      resolvedStyle &&
      Object.keys(nextStyle).some((key) => nextStyle[key] !== resolvedStyle[key])
    ) {
      return null;
    }
    resolvedStyle = nextStyle;
  }
  if (!resolvedStyle) return null;
  return {
    ...metrics,
    ...resolvedStyle,
    text: text.slice(textRange.start, textRange.end),
  };
}

function visibleTextStrikeCenterY(annotation, formattingRanges) {
  const metrics = textStrikeMetrics(annotation, formattingRanges);
  if (!metrics || !metrics.text || typeof document === "undefined") return null;
  const pdfFamily = standardPdfFontKey(metrics.fontFamily, false, false);
  if (!pdfFamily) return null;
  const family = pdfFamily.startsWith("Helvetica")
    ? "Arial, Helvetica, sans-serif"
    : pdfFamily.startsWith("Times")
      ? '"Times New Roman", Times, serif'
      : '"Courier New", Courier, monospace';
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = [
    metrics.italic ? "italic" : "",
    metrics.bold ? "bold" : "",
    `${metrics.fontSize}px`,
    family,
  ].filter(Boolean).join(" ");
  const measured = context.measureText(metrics.text);
  const ascent = measured.actualBoundingBoxAscent;
  const descent = measured.actualBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent + descent <= 0) {
    return null;
  }
  const centerY = (
    metrics.baselineY +
    metrics.verticalDirection * (ascent - descent) / 2
  ) / metrics.pageHeight;
  return centerY >= 0 && centerY <= 1 ? centerY : null;
}

export function textMarkLineY(annotation, segment, formattingRanges = []) {
  const measuredCenterY = annotation?.tool === "annotate-strike"
    ? visibleTextStrikeCenterY(annotation, formattingRanges)
    : null;
  if (Number.isFinite(measuredCenterY)) return measuredCenterY;
  if (
    annotation?.tool === "annotate-strike" &&
    Number.isFinite(annotation.strikeCenterY) &&
    annotation.strikeCenterY >= 0 &&
    annotation.strikeCenterY <= 1
  ) {
    return annotation.strikeCenterY;
  }
  return segment.y + segment.h * (
    annotation?.tool === "annotate-strike" ? 0.52 : 0.9
  );
}

export function refreshStrikeMarkSvgLines(
  svg,
  annotation,
  formattingRanges,
  rotation,
  formatPoints
) {
  const lines = svg.querySelectorAll("polyline");
  annotation.segments.forEach((segment, index) => {
    const lineY = textMarkLineY(annotation, segment, formattingRanges);
    const points = formatPoints(
      [
        { x: segment.x, y: lineY },
        { x: segment.x + segment.w, y: lineY },
      ],
      rotation
    );
    lines[index * 2]?.setAttribute("points", points);
    lines[index * 2 + 1]?.setAttribute("points", points);
  });
}

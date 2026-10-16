const styleValidators = {
  fontFamily: (value) => typeof value === "string" && value.length > 0 && value.length <= 100,
  fontSize: (value) => Number.isFinite(value) && value >= 1 && value <= 512,
  bold: (value) => typeof value === "boolean",
  italic: (value) => typeof value === "boolean",
  color: (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
};

function validateStyle(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    throw new TypeError("Formatting range style must be an object.");
  }
  const entries = Object.entries(style);
  if (!entries.length) throw new TypeError("Formatting range style cannot be empty.");
  for (const [key, value] of entries) {
    if (!styleValidators[key]?.(value)) {
      throw new TypeError(`Invalid formatting value for ${key}.`);
    }
  }
  return Object.fromEntries(entries);
}

export function validateTextRange(text, range) {
  if (typeof text !== "string" || !range || typeof range !== "object") return false;
  return Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= text.length;
}

function validateRanges(text, ranges) {
  if (typeof text !== "string" || !Array.isArray(ranges)) {
    throw new TypeError("Formatting ranges require text and an array.");
  }
  return ranges.map((range) => {
    if (!validateTextRange(text, range)) {
      throw new RangeError("Formatting range is outside the text.");
    }
    return { start: range.start, end: range.end, style: validateStyle(range.style) };
  });
}

function sameStyle(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key]);
}

export function normalizeFormattingRanges(text, ranges) {
  const validRanges = validateRanges(text, ranges);
  const boundaries = [...new Set(validRanges.flatMap(({ start, end }) => [start, end]))]
    .sort((left, right) => left - right);
  const normalized = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const style = {};
    for (const range of validRanges) {
      if (range.start <= start && range.end >= end) Object.assign(style, range.style);
    }
    if (!Object.keys(style).length) continue;
    const previous = normalized.at(-1);
    if (previous?.end === start && sameStyle(previous.style, style)) previous.end = end;
    else normalized.push({ start, end, style });
  }
  return normalized;
}

export function applyFormattingRange(text, ranges, start, end, style) {
  const next = validateRanges(text, ranges);
  const patch = validateStyle(style);
  if (!validateTextRange(text, { start, end })) {
    throw new RangeError("Formatting range is outside the text.");
  }
  return normalizeFormattingRanges(text, [
    ...next,
    { start, end, style: patch },
  ]);
}

function textChangeBounds(oldText, newText) {
  if (typeof oldText !== "string" || typeof newText !== "string") {
    throw new TypeError("Text remapping requires old and new strings.");
  }
  let prefix = 0;
  while (
    prefix < oldText.length &&
    prefix < newText.length &&
    oldText[prefix] === newText[prefix]
  ) prefix++;
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - suffix - 1] === newText[newText.length - suffix - 1]
  ) suffix++;
  return {
    prefix,
    oldChangedEnd: oldText.length - suffix,
    delta: newText.length - oldText.length,
  };
}

export function remapTextRange(oldText, newText, range) {
  if (!validateTextRange(oldText, range)) {
    throw new RangeError("Selected range is outside the original text.");
  }
  const { prefix, oldChangedEnd, delta } = textChangeBounds(oldText, newText);
  if (range.end <= prefix) return { start: range.start, end: range.end };
  if (range.start >= oldChangedEnd) {
    return { start: range.start + delta, end: range.end + delta };
  }
  return null;
}

export function remapFormattingRanges(oldText, newText, ranges) {
  const validRanges = normalizeFormattingRanges(oldText, ranges);
  const { prefix, oldChangedEnd, delta } = textChangeBounds(oldText, newText);
  const remapped = [];
  for (const range of validRanges) {
    const leftEnd = Math.min(range.end, prefix);
    if (range.start < leftEnd) {
      remapped.push({ ...range, end: leftEnd });
    }
    const rightStart = Math.max(range.start, oldChangedEnd);
    if (range.end > rightStart) {
      remapped.push({
        ...range,
        start: rightStart + delta,
        end: range.end + delta,
      });
    }
  }
  return normalizeFormattingRanges(newText, remapped);
}

export function styleForTextRange(ranges, start, end) {
  const style = {};
  for (const range of ranges) {
    if (range.start < end && range.end > start) Object.assign(style, range.style);
  }
  return style;
}

export function formattingTextSegments(text, ranges) {
  const normalized = normalizeFormattingRanges(text, ranges);
  const segments = [];
  let offset = 0;
  for (const range of normalized) {
    if (offset < range.start) {
      segments.push({ start: offset, end: range.start, text: text.slice(offset, range.start), style: null });
    }
    segments.push({
      start: range.start,
      end: range.end,
      text: text.slice(range.start, range.end),
      style: range.style,
    });
    offset = range.end;
  }
  if (offset < text.length) {
    segments.push({ start: offset, end: text.length, text: text.slice(offset), style: null });
  }
  return segments;
}

export function standardPdfFontKey(family, bold, italic) {
  const familyKey = {
    Helvetica: "Helvetica",
    Arial: "Helvetica",
    "Arial, sans-serif": "Helvetica",
    "sans-serif": "Helvetica",
    Times: "TimesRoman",
    TimesRoman: "TimesRoman",
    "Times New Roman": "TimesRoman",
    serif: "TimesRoman",
    Courier: "Courier",
    "Courier New": "Courier",
    monospace: "Courier",
  }[family];
  if (!familyKey) return null;
  if (familyKey === "Courier") {
    return bold
      ? italic ? "CourierBoldOblique" : "CourierBold"
      : italic ? "CourierOblique" : "Courier";
  }
  if (familyKey === "TimesRoman") {
    return bold
      ? italic ? "TimesRomanBoldItalic" : "TimesRomanBold"
      : italic ? "TimesRomanItalic" : "TimesRoman";
  }
  return bold
    ? italic ? "HelveticaBoldOblique" : "HelveticaBold"
    : italic ? "HelveticaOblique" : "Helvetica";
}

export function horizontalScaleForAdvance(sourceAdvance, formattedAdvance, baseScale) {
  if (
    !Number.isFinite(sourceAdvance) ||
    sourceAdvance <= 0 ||
    !Number.isFinite(formattedAdvance) ||
    formattedAdvance <= 0 ||
    !Number.isFinite(baseScale) ||
    baseScale <= 0
  ) return null;
  return baseScale * sourceAdvance / formattedAdvance;
}

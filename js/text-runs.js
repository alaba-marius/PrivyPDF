const closeEnough = (left, right, tolerance = 0.01) =>
  Math.abs(left - right) <= tolerance;

const sameMatrix = (left, right) =>
  left?.length === right?.length &&
  left.every((value, index) => closeEnough(value, right[index], 0.001));

// Each operation's spacing is measured into its advance and candidate geometry.
const compatibleTextState = (part, first) =>
  part.fontName === first.fontName &&
  part.fontSize === first.fontSize &&
  part.horizontalScale === first.horizontalScale &&
  part.textRenderingMode === first.textRenderingMode &&
  part.textRise === first.textRise &&
  part.fillColorCommand === first.fillColorCommand &&
  part.strokeColorCommand === first.strokeColorCommand &&
  part.graphicsStateSignature === first.graphicsStateSignature &&
  sameMatrix(part.ctm, first.ctm) &&
  part.textObjectSignature === first.textObjectSignature;

const horizontalMatrixCompatible = (part, first) =>
  part.textMatrix?.length === 6 &&
  first.textMatrix?.length === 6 &&
  Number.isFinite(part.textMatrix[0]) &&
  part.textMatrix[0] > 0 &&
  closeEnough(part.textMatrix[1], 0, 0.001) &&
  sameMatrix(part.textMatrix.slice(1, 4), first.textMatrix.slice(1, 4));

const textObjectTrackedOperands = new Map([
  ["Tf", 2],
  ["Tm", 6],
  ["Tc", 1],
  ["Tw", 1],
  ["Tz", 1],
  ["TL", 1],
  ["Tr", 1],
  ["Ts", 1],
  ["Td", 2],
  ["TD", 2],
  // Stroke color is compared through strokeColorCommand in graphicsStateSignature.
  ["G", 1],
  ["RG", 3],
  ["K", 4],
]);

export function textObjectSignature(tokens) {
  const ignored = new Set();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "word") continue;
    const operandCount = textObjectTrackedOperands.get(token.value);
    if (operandCount === undefined) continue;
    for (let operandIndex = Math.max(0, index - operandCount); operandIndex < index; operandIndex++) {
      ignored.add(operandIndex);
    }
    ignored.add(index);
  }
  return tokens
    .filter((_, index) => !ignored.has(index) && index !== tokens.length - 1)
    .map((token) => `${token.type}:${token.value}`)
    .join("|");
}

export async function independentTextRunCandidates(
  showStrings,
  {
    originalText,
    expected,
    decodeText,
    showPosition,
    sourceAdvanceFor,
  }
) {
  if (!originalText || !Number.isFinite(expected?.width) || expected.width <= 0) {
    return [];
  }

  const validRuns = [];
  const expectedRight = expected.x + expected.width;
  const boundsTolerance = Math.max(1.25, expected.width * 0.01);
  for (let start = 0; start < showStrings.length; start++) {
    const first = showStrings[start];
    if (
      !first.isStandaloneShow ||
      !first.fillColorCommand ||
      !Number.isInteger(first.textRenderingMode) ||
      first.textRenderingMode < 0 ||
      first.textRenderingMode > 3 ||
      [1, 2].includes(first.textRenderingMode) && !first.strokeColorCommand
    ) continue;
    const firstText = decodeText(first);
    if (!firstText || !originalText.startsWith(firstText)) continue;

    const firstPosition = showPosition(first);
    if (
      !firstPosition ||
      firstPosition.xVector <= 0 ||
      Math.abs(firstPosition.yVector) > 0.001 ||
      !horizontalMatrixCompatible(first, first)
    ) continue;

    const parts = [];
    let text = "";
    let previous = null;
    let finalAdvance = null;
    let invalid = false;
    for (let index = start; index < showStrings.length; index++) {
      const part = showStrings[index];
      if (!part.isStandaloneShow) break;
      const partText = decodeText(part);
      if (!partText) break;
      const visiblePartText = partText.replace(/ +$/, "");
      const omittedTrailingPadding =
        visiblePartText.length > 0 &&
        visiblePartText !== partText &&
        text + visiblePartText === originalText;
      const matchedPartText = omittedTrailingPadding ? visiblePartText : partText;
      if (!originalText.startsWith(text + matchedPartText)) break;

      const position = showPosition(part);
      const measuredAdvance = await sourceAdvanceFor(part);
      const advance = measuredAdvance * position?.xVector;
      if (
        !position ||
        !Number.isFinite(advance) ||
        advance <= 0 ||
        !compatibleTextState(part, first) ||
        !horizontalMatrixCompatible(part, first) ||
        Math.abs(position.y - firstPosition.y) > 0.25 ||
        position.x < expected.x - boundsTolerance ||
        position.x > expectedRight + boundsTolerance ||
        position.x + advance > expectedRight + boundsTolerance ||
        previous && position.x <= previous.position.x
      ) {
        invalid = true;
        break;
      }

      parts.push(part);
      text += matchedPartText;
      previous = { part, position };
      finalAdvance = advance;
      if (text === originalText && parts.length > 1) {
        const geometryWidth = position.x - firstPosition.x + finalAdvance;
        if (
          closeEnough(firstPosition.x, expected.x, 1.25) &&
          closeEnough(firstPosition.y, expected.y, 1.25) &&
          closeEnough(geometryWidth, expected.width, boundsTolerance)
        ) {
          validRuns.push({
            ...first,
            text,
            parts: parts.slice(),
            sourceCodes: parts.flatMap((part) => part.bytes),
            tjAdjustment: parts.reduce(
              (sum, part) => sum + (part.tjAdjustment || 0),
              0
            ),
            measuredWidth: geometryWidth / firstPosition.xVector,
            geometryWidth,
            multiOperation: true,
            independentlyPositioned: true,
          });
        }
        break;
      }
    }
    if (invalid) continue;
  }
  return validRuns;
}

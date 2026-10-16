import assert from "node:assert/strict";
import test from "node:test";
import {
  independentTextRunCandidates,
  textObjectSignature,
} from "../js/text-runs.js";

function makeGlyph(character, horizontalScale, x, advance, overrides = {}) {
  return {
    text: character,
    bytes: [character.charCodeAt(0)],
    fontName: "/F1",
    fontSize: 20,
    horizontalScale: 100,
    characterSpacing: 0,
    wordSpacing: 0,
    textRenderingMode: 0,
    textRise: 0,
    fillColorCommand: "0.2 g",
    graphicsStateSignature: "q 0 0 600 800 re W n",
    textObjectSignature: "name:/F1|word:20",
    ctm: [1, 0, 0, 1, 0, 0],
    textMatrix: [horizontalScale, 0, 0, 1, x, 110],
    isStandaloneShow: true,
    advance,
    ...overrides,
  };
}

async function findRuns(
  showStrings,
  originalText = "ABC",
  expected = { x: 48, y: 110, width: 40.922 }
) {
  return independentTextRunCandidates(showStrings, {
    originalText,
    expected,
    decodeText: (part) => part.text,
    showPosition: (part) => ({
      x: part.textMatrix[4],
      y: part.textMatrix[5],
      xVector: part.textMatrix[0],
      yVector: part.textMatrix[1],
    }),
    sourceAdvanceFor: (part) => part.advance,
  });
}

const variableTmFixture = [
  makeGlyph("A", 1, 48, 13.34),
  makeGlyph("B", 1.18, 61.34, 13.34),
  makeGlyph("C", 0.82, 77.0812, 14.44),
];

const pageOneLine = "I cannot attend on-site exam because I work from home as a Virtual Assistant and graphic";
const pageOneOperations = [
  ["I cannot attend ", 72.024, 80.276],
  ["on", 152.3, 13.2],
  ["-", 165.5, 4.08],
  ["site exam ", 169.58, 51.75],
  ["because I work from home as a Virtual Assistant and graphic ", 221.33, 312.06],
];

function pageOneOperation(
  text,
  x,
  advance,
  hasExplicitStrokeColor = false,
  overrides = {}
) {
  const signatureTokens = [
    { type: "word", value: "0" },
    { type: "word", value: "g" },
    ...(hasExplicitStrokeColor
      ? [
          { type: "word", value: "0" },
          { type: "word", value: "G" },
        ]
      : []),
    { type: "string", value: "(show operand)" },
  ];
  return {
    text,
    bytes: Array.from(text, (character) => character.charCodeAt(0)),
    fontName: "/F2",
    fontSize: 12,
    horizontalScale: 100,
    characterSpacing: 0,
    wordSpacing: 0,
    textRenderingMode: 0,
    textRise: 0,
    fillColorCommand: "0 g",
    strokeColorCommand: "0 G",
    graphicsStateSignature: JSON.stringify(["0 G", "", "", []]),
    textObjectSignature: textObjectSignature(signatureTokens),
    ctm: [1, 0, 0, 1, 0, 0],
    textMatrix: [1, 0, 0, 1, x, 583.9],
    isStandaloneShow: true,
    advance,
    ...overrides,
  };
}

test("matches the independent-glyph PDF fixture with varying Tm horizontal scales", async () => {
  const [match] = await findRuns(variableTmFixture);

  assert.ok(match);
  assert.equal(match.text, "ABC");
  assert.equal(match.parts.length, 3);
  assert.equal(match.geometryWidth, 40.922);
  assert.equal(match.measuredWidth, 40.922);
  assert.equal(match.independentlyPositioned, true);
});

test("matches the page-one line when an equivalent explicit 0 G is tracked separately", async () => {
  const showStrings = pageOneOperations.map(([text, x, advance], index) => {
    const spacingState = {
      ...(index === 1 ? { characterSpacing: -0.024, advance: 13.188 } : {}),
      ...(index === 4 ? { tjAdjustment: -2 } : {}),
    };
    return pageOneOperation(text, x, advance, index === 1, spacingState);
  });
  assert.equal(showStrings[0].textObjectSignature, showStrings[1].textObjectSignature);

  const [match] = await findRuns(showStrings, pageOneLine, {
    x: 72.024,
    y: 583.9,
    width: 458.99,
  });

  assert.ok(match);
  assert.equal(match.text, pageOneLine);
  assert.equal(match.parts.length, 5);
  assert.equal(match.geometryWidth, 461.366);
});

test("rejects the page-one line when a split operation has a different stroke color", async () => {
  const showStrings = pageOneOperations.map(([text, x, advance], index) =>
    pageOneOperation(text, x, advance, index === 1)
  );
  showStrings[1].strokeColorCommand = "1 G";
  showStrings[1].graphicsStateSignature = JSON.stringify(["1 G", "", "", []]);

  assert.deepEqual(
    await findRuns(showStrings, pageOneLine, {
      x: 72.024,
      y: 583.9,
      width: 458.99,
    }),
    []
  );
});

test("rejects the page-one line when a source operation exceeds the selected bounds", async () => {
  const showStrings = pageOneOperations.map(([text, x, advance], index) => {
    const spacingState = index === 1
      ? { characterSpacing: -0.024, advance: 13.188 }
      : {};
    return pageOneOperation(text, x, advance, index === 1, spacingState);
  });
  showStrings[4].textMatrix[4] += 10;

  assert.deepEqual(
    await findRuns(showStrings, pageOneLine, {
      x: 72.024,
      y: 583.9,
      width: 458.99,
    }),
    []
  );
});

test("rejects ambiguous groups and glyphs with incompatible geometry or graphics state", async () => {
  assert.equal((await findRuns([...variableTmFixture, ...variableTmFixture])).length, 2);
  assert.equal(
    (await findRuns([
      variableTmFixture[0],
      makeGlyph(
        "B",
        1.18,
        61.34,
        13.34,
        { textMatrix: [1.18, 0, 0, 1, 61.34, 111] }
      ),
      variableTmFixture[2],
    ])).length,
    0
  );
  assert.equal(
    (await findRuns([
      variableTmFixture[0],
      makeGlyph("B", 1.18, 61.34, 13.34, {
        graphicsStateSignature: "different clip",
      }),
      variableTmFixture[2],
    ])).length,
    0
  );
});

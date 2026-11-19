// Page-card view: markup for the demo sheets. Pure (no store, no DOM except
// the CSSOM helper), so it can be tested without a browser and cards.js stays
// a thin controller over it. All classes come from css/theme.css.
import { icon } from "../icons.js";

// Seven varied demo sheets so the demo grid isn't repetitive.
export const DEMO_SHEETS = [
  [lineShape(60), headingShape(52), imageShape(), chartShape()],
  [lineShape(90), imageShape(), chartShape()],
  [headingShape(44), imageShape(), lineShape(44)],
  [chartShape(), imageShape(), headingShape(58)],
  [lineShape(58), imageShape(), lineShape(78)],
  [headingShape(52), chartShape(), imageShape()],
  [imageShape(), lineShape(66), headingShape(48)],
];

export function lineShape(w) {
  return `<div class="ds-shape-line" data-w="${w}"></div>`;
}

export function headingShape(w) {
  return `<div class="ds-shape-heading" data-w="${w}"></div>`;
}

export function imageShape() {
  return `<div class="ds-shape-block" data-w="100"></div>`;
}

export function chartShape() {
  return `<div class="ds-shape-chart">
    <div class="bar" data-h="40"></div>
    <div class="bar dark" data-h="65"></div>
    <div class="bar" data-h="50"></div>
    <div class="bar dark" data-h="90"></div>
  </div>`;
}

export function sheetHtml(page, index) {
  const parts = DEMO_SHEETS[index % DEMO_SHEETS.length].join("");
  return `<div class="ds-sheet" data-rotate="${page.rotated}"><div class="ds-sheet-page">${parts}</div></div>`;
}

export function checkMarkup() {
  return `<div class="ds-check" aria-hidden="true">${icon("check")}</div>`;
}

// Apply data-* presentational attributes through the CSSOM. element.style
// assignments are script-driven, so the strict CSP (style-src 'self', no
// 'unsafe-inline') does not block them — unlike inline style attributes.
export function applySheetStyles(sheet) {
  const rotate = sheet.dataset.rotate;
  if (rotate !== undefined) sheet.style.setProperty("--rotate", `${rotate}deg`);
  const page = sheet.querySelector(".ds-sheet-page");
  if (page) page.style.setProperty("--scale", rotate === "90" || rotate === "270" ? "0.77" : "1");
  for (const shape of sheet.querySelectorAll("[data-w]")) {
    shape.style.width = `${shape.dataset.w}%`;
  }
  for (const shape of sheet.querySelectorAll("[data-h]")) {
    shape.style.height = `${shape.dataset.h}%`;
  }
}

// Page-card view: markup for real pages. Pure (no store, no DOM except the
// CSSOM helper), so it can be tested without a browser and cards.js stays a
// thin controller over it. All classes come from css/theme.css and
// css/editor.css. A page is { id, sourceId, index, baseRotation, rotated,
// width, height } and its effective rotation is baseRotation + rotated.
import { effectiveRotation } from "./pages.js";
import { icon } from "../icons.js";

export function sheetHtml(page) {
  const rotate = effectiveRotation(page);
  return `
    <div class="ds-sheet" data-rotate="${rotate}">
      <div class="ds-sheet-page">
        <div class="thumb-skeleton ds-skeleton" aria-hidden="true"></div>
        <canvas class="page-canvas" hidden aria-hidden="true" width="0" height="0"></canvas>
      </div>
    </div>
  `;
}

export function checkMarkup() {
  return `<div class="ds-check" aria-hidden="true">${icon("check")}</div>`;
}

// Apply the sheet's rotation through the CSSOM. element.style assignments are
// script-driven, so the strict CSP (style-src 'self', no 'unsafe-inline')
// does not block them — unlike inline style attributes.
export function applySheetStyles(sheet, { rotate, scale } = {}) {
  sheet.style.setProperty("--rotate", `${rotate}deg`);
  if (scale != null) sheet.style.setProperty("--scale", `${scale}`);
}

// Fit `pageW x pageH` inside `boxW x boxH` without stretching (contain, never
// upscale beyond the page's natural size). Returns the displayed size.
export function fitSize(pageW, pageH, boxW, boxH) {
  const scale = Math.min(boxW / pageW, boxH / pageH, 1);
  return {
    width: Math.max(1, Math.round(pageW * scale)),
    height: Math.max(1, Math.round(pageH * scale)),
  };
}

// Uniform scale that keeps the page inside `boxW x boxH`, never upscaled beyond
// 1. The scale is derived from the effective rotation (file's own /Rotate plus
// the user rotation), not the user rotation alone: at effective rotation 0 or
// 180 the fitted page already fits the box, so the scale is exactly 1; at
// effective 90 or 270 the fitted page (the page's rotation-0 width and height
// fit into the box, never swapped again for baseRotation) is scaled down so the
// rotated bitmap still fits. Re-syncing never shrinks the page, because the box
// is measured in layout units (offsetWidth / offsetHeight), not in transformed
// bounding-box pixels.
export function rotationScale(rotation, pageW, pageH, baseRotation, boxW, boxH) {
  const effective = (((baseRotation ?? 0) + (rotation ?? 0)) % 360 + 360) % 360;
  if (effective === 0 || effective === 180) return 1;
  const { width: dw, height: dh } = fitSize(pageW, pageH, boxW, boxH);
  return Math.min(boxW / dh, boxH / dw, 1);
}

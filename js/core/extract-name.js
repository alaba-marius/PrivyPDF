// File name for downloading an extract of the selected pages:
// "<doc name>-pages-<ranges>.pdf", where ranges are the 1-based positions of
// the selected pages in the current order, compressed ("3-5,9"). The stem is
// truncated to 40 characters (then "-etc" is appended) and sanitized like the
// normal export name. Pure: no DOM, no store.
import { sanitizeName } from "./exporter.js";

export function compressRanges(positions) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      parts.push(start === end ? String(start) : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  if (sorted.length > 0) {
    parts.push(start === end ? String(start) : `${start}-${end}`);
  }
  return parts.join(",");
}

export function extractFileName(docName, positions) {
  const stem = `${sanitizeName(docName)}-pages-${compressRanges(positions)}`;
  const truncated = stem.length > 40 ? stem.slice(0, 40) + "-etc" : stem;
  return `${sanitizeName(truncated)}.pdf`;
}

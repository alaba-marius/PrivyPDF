// Turns a file into a source: magic-byte validation happens before this, so
// the file is already known to be a PDF, PNG or JPEG. loadPdf is injected so
// tests can drive this module without pdf.js: the real loader (in js/editor.js)
// injects pdf.js loading, and tests inject a fake that resolves with a stub
// document or rejects with a password/corrupt error.
import { readBytes } from "../file-manager.js";

export function createSourceLoader({ loadPdf, decodeImage }) {
  async function readAllBytes(file) {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  return {
    async loadFile(file) {
      const bytes = await readAllBytes(file);

      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const pdfjsDoc = await loadPdf(bytes.slice());
        const numPages = pdfjsDoc.numPages;
        if (!numPages) throw new Error("The PDF has no pages.");
        const pages = [];
        for (let index = 0; index < numPages; index++) {
          const pdfPage = await pdfjsDoc.getPage(index + 1);
          const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
          pages.push({
            index,
            baseRotation: pdfPage.rotate,
            width: viewport.width,
            height: viewport.height,
          });
        }
        return {
          kind: "pdf",
          bytes,
          size: bytes.length,
          pageCount: numPages,
          pdfjsDoc,
          pages,
        };
      }

      const imageBitmap = await decodeImage(bytes, file.type);
      // A single-page source so the page list in editor.js always has an entry.
      return {
        kind: "image",
        bytes,
        size: bytes.length,
        pageCount: 1,
        pages: [{ index: 0, baseRotation: 0, width: imageBitmap.width, height: imageBitmap.height }],
        imageBitmap,
        width: imageBitmap.width,
        height: imageBitmap.height,
      };
    },
  };
}

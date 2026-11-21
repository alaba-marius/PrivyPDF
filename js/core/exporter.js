// PDF export built in this tab with the vendored pdf-lib. pdFLib is injected
// (tests pass a fake); otherwise it is dynamically imported from the vendored
// bundle the first time someone exports.
const PDFLIB_URL = "/vendor/pdf-lib/pdf-lib.esm.min.js";

export function sanitizeName(fileName) {
  return String(fileName || "document")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 96) || "document";
}

export function createExporter({ PDFLib } = {}) {
  let pdfLibPromise;

  async function getPDFLib() {
    if (PDFLib) return PDFLib;
    if (!pdfLibPromise) {
      pdfLibPromise = import(PDFLIB_URL);
    }
    return pdfLibPromise;
  }

  async function exportPages({ pages, getSource, fileName, exportMode, selected }) {
    const PDFLib = await getPDFLib();
    const { PDFDocument, degrees } = PDFLib;

    // getSource is keyed by source id and returns { kind, bytes, type, width, height }.
    const targets =
      exportMode === "selected"
        ? pages.filter((page) => selected.has(page.id))
        : pages.slice();

    const outDoc = await PDFDocument.create();
    outDoc.setProducer("PrivyPDF");
    outDoc.setCreator("PrivyPDF");

    const sourceDocs = new Map(); // source id -> opened pdf-lib document
    let processed = 0;

    for (const page of targets) {
      const source = getSource(page.sourceId);
      if (!source) throw new Error(`No source found for page ${page.id}`);

      if (source.kind === "pdf") {
        let doc = sourceDocs.get(source.id);
        if (!doc) {
          doc = await PDFDocument.load(source.bytes);
          sourceDocs.set(source.id, doc);
        }
        // The copied page's rotation already includes the file's own /Rotate
        // (baseRotation); add the user's rotation on top. copyPages must be
        // called on the output document, not the source document, otherwise
        // adding the copied page to the output throws ForeignPageError.
        const [copied] = await outDoc.copyPages(doc, [page.index]);
        copied.setRotation(degrees(((copied.getRotation().angle ?? 0) + page.rotated) % 360));
        outDoc.addPage(copied);
      } else {
        const embed =
          source.type === "image/jpeg" ? await outDoc.embedJpg(source.bytes) : await outDoc.embedPng(source.bytes);
        const imagePage = outDoc.addPage([source.width, source.height]);
        imagePage.drawImage(embed, 0, 0, source.width, source.height);
      }

      processed++;
      // Yield to the main thread every few pages so long exports stay
      // responsive instead of blocking the tab for seconds.
      if (processed % 8 === 0 && processed < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const bytes = await outDoc.save();
    return { name: `${sanitizeName(fileName)}.pdf`, bytes };
  }

  return { exportPages };
}

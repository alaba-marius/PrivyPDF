export function createExportActions({
  state,
  els,
  beginBusy,
  snapshotPages,
  getRevision,
  selectedPages,
  toast,
  formatBytes,
  exportPdf,
  downloadBytes,
}) {
  function fileName(suffix = "") {
    const clean = (els.fileName.value.trim() || "document").replace(/[\\/:*?"<>|]+/g, "-");
    return `${clean}${suffix}.pdf`;
  }

  async function exportPages(pages, name) {
    if (!pages.length || state.busy) return;
    const invalidEdit = pages
      .flatMap((page) => page.annotations || [])
      .find((annotation) => annotation.type === "text-edit" && annotation.validationError);
    if (invalidEdit) {
      toast(
        `Fix the in-place PDF text edit before exporting: ${invalidEdit.validationError}`,
        { type: "error" }
      );
      return;
    }
    const revision = getRevision();
    const pageIds = new Set(pages.map((page) => page.id));
    const stablePages = snapshotPages().filter((page) => pageIds.has(page.id));
    if (!stablePages.length) return;
    const finishBusy = beginBusy("Building PDF…");
    try {
      const bytes = await exportPdf(stablePages, state.sources, { title: name.replace(/\.pdf$/, "") });
      downloadBytes(bytes, name);
      const changedDuringExport = revision !== getRevision();
      toast(
        changedDuringExport
          ? `Generated ${name} (${formatBytes(bytes.byteLength)}) and requested a browser download. New edits remain unsaved.`
          : `Generated ${name} (${formatBytes(bytes.byteLength)}) and requested a browser download on your device.`
      );
      return true;
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "The PDF uses unsupported features.";
      toast(`Export failed: ${message}`, { type: "error" });
    } finally {
      finishBusy();
    }
  }

  async function downloadAll() {
    const revision = getRevision();
    if (await exportPages(state.pages, fileName()) && revision === getRevision()) state.dirty = false;
  }

  function saveSession() {
    if (!state.pages.length || state.busy) return;
    state.dirty = false;
    toast("Changes saved in this editor session. Use Download to save a PDF file.");
  }

  function extractSelected() {
    if (!state.selected.size) {
      toast("Select the pages you want to extract.", { type: "error" });
      return;
    }
    exportPages(selectedPages(), fileName("-extract"));
  }

  return { fileName, exportPages, downloadAll, saveSession, extractSelected };
}
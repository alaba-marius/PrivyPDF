export function createExportActions({
  state,
  els,
  setBusy,
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
    setBusy(true);
    try {
      const bytes = await exportPdf(pages, state.sources, { title: name.replace(/\.pdf$/, "") });
      downloadBytes(bytes, name);
      toast(`Downloaded ${name} (${formatBytes(bytes.byteLength)}), built on your device.`);
      return true;
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "The PDF uses unsupported features.";
      toast(`Export failed: ${message}`, { type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    if (await exportPages(state.pages, fileName())) state.dirty = false;
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
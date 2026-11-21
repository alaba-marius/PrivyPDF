// Right-hand editor panel: document info, export controls, live privacy
// counter, the source-file list and keyboard shortcuts. All mutations go
// through callbacks.
import { formatBytes } from "../file-manager.js";
import { subscribe as subscribeMeter } from "../core/privacy-meter.js";
import { hydrateIcons } from "../icons.js";

export function mountPanel(root, opts = {}) {
  const {
    onFileNameChange,
    onExportModeChange,
    onDownloadPDF,
    onSourceRemove,
  } = opts;

  const docName = root.querySelector("#doc-name");
  const statPages = root.querySelector("#stat-pages");
  const statSource = root.querySelector("#stat-source");
  const statSize = root.querySelector("#stat-size");
  const sourceList = root.querySelector("#source-files");
  const exportAll = root.querySelector("#export-all");
  const exportSelected = root.querySelector("#export-selected");
  const downloadPdf = root.querySelector("#download-pdf");
  const privacyCount = root.querySelector("#privacy-count");

  const unsubscribe = subscribeMeter((n) => {
    privacyCount.textContent = n;
  });

  let editingName = false;

  docName.addEventListener("focus", () => {
    editingName = true;
  });
  docName.addEventListener("blur", () => {
    editingName = false;
    const value = docName.value.trim();
    if (value && onFileNameChange) onFileNameChange(value);
  });

  exportAll.addEventListener("click", () => {
    if (onExportModeChange) onExportModeChange("all");
  });
  exportSelected.addEventListener("click", () => {
    if (onExportModeChange) onExportModeChange("selected");
  });
  downloadPdf.addEventListener("click", () => {
    if (onDownloadPDF) onDownloadPDF();
  });

  return {
    render(state) {
      statPages.textContent = state.pages.length;
      statSource.textContent = state.sourceFiles.length;
      statSize.textContent = formatBytes(state.totalSize);

      exportSelected.textContent = `Selected (${state.selected.length})`;
      exportAll.classList.toggle("ds-segment--active", state.exportMode === "all");
      exportSelected.classList.toggle("ds-segment--active", state.exportMode === "selected");

      if (!editingName) docName.value = state.fileName.replace(/\.pdf$/i, "");

      sourceList.textContent = "";
      state.sourceFiles.forEach((file) => {
        const item = document.createElement("div");
        item.className = "source-item";

        const name = document.createElement("span");
        name.className = "source-item-name";
        const type = file.type === "application/pdf" ? "PDF" : "image";
        name.textContent = `${file.name} · ${formatBytes(file.size)} · ${type}`;
        item.appendChild(name);

        const remove = document.createElement("button");
        remove.className = "ds-icon-btn";
        remove.setAttribute("aria-label", `Remove ${file.name}`);
        remove.innerHTML = '<i data-icon="x"></i>';
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          onSourceRemove?.(file.id);
        });
        item.appendChild(remove);

        hydrateIcons(item);
        sourceList.appendChild(item);
      });
    },
    destroy() {
      unsubscribe();
    },
  };
}

import { pickFiles, setupDropTarget } from "../file-manager.js";

// Wraps a drop/click target: opens the file picker on click or Enter/Space,
// and forwards dropped or picked files to onFiles. No file names or contents
// are logged anywhere.
export function mountDropzone(el, onFiles) {
  let choosing = false;

  async function choose() {
    if (choosing) return;
    choosing = true;
    try {
      const files = await pickFiles();
      if (files.length) onFiles(files);
    } finally {
      choosing = false;
    }
  }

  el.addEventListener("click", choose);
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose();
    }
  });
  setupDropTarget(el, onFiles);

  return {
    destroy() {
      el.removeEventListener("click", choose);
      el.removeEventListener("keydown", choose);
    },
  };
}

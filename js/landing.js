import { initSite } from "./site.js";
import { pickFiles, setupDropTarget, isSupported, stashFiles } from "./file-manager.js";
import { toast } from "./toast.js";

initSite();

const drop = document.getElementById("hero-drop");

async function openInEditor(files) {
  const supported = files.filter(isSupported);
  if (!supported.length) {
    toast("Please choose a PDF, JPG or PNG file.", { type: "error" });
    return;
  }
  await stashFiles(supported);
  window.location.href = "/editor.html";
}

if (drop) {
  setupDropTarget(drop, openInEditor);
  const choose = async () => {
    const files = await pickFiles();
    if (files.length) openInEditor(files);
  };
  drop.addEventListener("click", choose);
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose();
    }
  });
}

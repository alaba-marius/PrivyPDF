import { setupDropTarget } from "./file-manager.js";

export function setupToolbar({
  state,
  els,
  $,
  chooseFiles,
  undo,
  redo,
  rotate,
  insertBlank,
  duplicate,
  removeSelected,
  extractSelected,
  downloadAll,
  saveSession,
  addStamp,
  setZoom,
  render,
  fileName,
  addFiles,
  insertionIndex,
  selectFromEvent,
  scrollToPage,
  renderSelection,
  indexOf,
  moveSelectedBy,
  moveSelectedTo,
  setAnnotationTool,
}) {
  $("btn-add").addEventListener("click", chooseFiles);
  $("save-changes").addEventListener("click", saveSession);
  document.querySelectorAll("[data-edit-annotation-color]").forEach((input) => {
    input.value = $("annotation-color").value;
    input.addEventListener("input", () => {
      $("annotation-color").value = input.value;
      document.querySelectorAll("[data-edit-annotation-color]").forEach((control) => {
        control.value = input.value;
      });
    });
  });
  const syncToolOptionsRow = () => {
    document.body.classList.toggle(
      "has-tool-options",
      Boolean(document.querySelector(
        ".text-insert-options:not([hidden]), .shape-menu:not([hidden]), .edit-tool-menu:not([hidden])"
      ))
    );
  };
  const positionToolOptions = (menu) => {
    menu.style.left = "0px";
    menu.style.top = `${document.querySelector(".toolbar").getBoundingClientRect().bottom}px`;
  };
  const closeEditMenus = () => {
    document.querySelectorAll(".edit-tool-menu").forEach((menu) => {
      menu.hidden = true;
    });
    document.querySelectorAll("[data-edit-menu]").forEach((toggle) => {
      toggle.setAttribute("aria-expanded", "false");
    });
    syncToolOptionsRow();
  };
  const editorModeSwitch = $("editor-mode-switch");
  editorModeSwitch.checked = state.editorMode === "edit";
  editorModeSwitch.setAttribute("aria-checked", String(editorModeSwitch.checked));
  editorModeSwitch.addEventListener("change", () => {
    closeEditMenus();
    state.editorMode = editorModeSwitch.checked ? "edit" : "annotate";
    document.body.dataset.editorMode = state.editorMode;
    editorModeSwitch.setAttribute("aria-checked", String(editorModeSwitch.checked));
    setAnnotationTool(state.editorMode === "edit" ? "select" : "drag");
  });
  document.querySelectorAll("[data-edit-menu]").forEach((toggle) => {
    const menu = document.getElementById(`edit-menu-${toggle.dataset.editMenu}`);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      closeEditMenus();
      if (!open) return;
      document.body.append(menu);
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      positionToolOptions(menu);
      syncToolOptionsRow();
    });
  });
  document.querySelectorAll("[data-edit-tool]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setAnnotationTool(button.dataset.editTool);
      closeEditMenus();
    });
  });
  document.querySelectorAll("[data-edit-stamp]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addStamp(button.dataset.editStamp);
      closeEditMenus();
    });
  });
  document.querySelectorAll("[data-edit-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closeEditMenus();
      if (button.dataset.editAction === "image") {
        setAnnotationTool("image");
        $("insert-image-file").click();
      } else if (button.dataset.editAction === "attachment") {
        setAnnotationTool("attachment");
        $("insert-attachment-file").click();
      } else if (button.dataset.editAction === "undo") {
        undo();
      } else if (button.dataset.editAction === "redo") {
        redo();
      } else if (button.dataset.editAction === "custom-stamp") {
        setAnnotationTool("stamp-gallery");
        $("stamp-create").click();
      } else if (button.dataset.editAction === "signature-manager") {
        setAnnotationTool("signature-library");
      }
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".edit-tool-menu-wrap, .edit-tool-menu")) closeEditMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openMenu = [...document.querySelectorAll(".edit-tool-menu")].find((menu) => !menu.hidden);
    if (!openMenu) return;
    const toggle = document.querySelector(`[data-edit-menu="${openMenu.id.replace("edit-menu-", "")}"]`);
    closeEditMenus();
    toggle?.focus();
  });
  window.addEventListener("resize", () => {
    document.querySelectorAll(".edit-tool-menu:not([hidden])").forEach(positionToolOptions);
  });
  const shapeToggle = $("shape-menu-toggle");
  const shapeMenu = $("shape-menu");
  document.body.append(shapeMenu);
  const closeShapeMenu = () => {
    shapeMenu.hidden = true;
    shapeToggle.setAttribute("aria-expanded", "false");
    syncToolOptionsRow();
  };
  shapeToggle.addEventListener("click", () => {
    const open = shapeMenu.hidden;
    shapeMenu.hidden = !open;
    shapeToggle.setAttribute("aria-expanded", String(open));
    if (open) {
      positionToolOptions(shapeMenu);
    }
    syncToolOptionsRow();
  });
  shapeMenu.querySelectorAll("[data-shape]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setAnnotationTool(`shape-${button.dataset.shape}`);
      closeShapeMenu();
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".shape-tool, #shape-menu")) closeShapeMenu();
  });
  window.addEventListener("resize", () => {
    if (!shapeMenu.hidden) positionToolOptions(shapeMenu);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || shapeMenu.hidden) return;
    closeShapeMenu();
    shapeToggle.focus();
  });
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
  $("annotation-undo").addEventListener("click", undo);
  $("annotation-redo").addEventListener("click", redo);
  $("btn-rotate-left").addEventListener("click", () => rotate(-90));
  $("btn-rotate-right").addEventListener("click", () => rotate(90));
  $("btn-blank").addEventListener("click", insertBlank);
  $("btn-duplicate").addEventListener("click", duplicate);
  $("btn-delete").addEventListener("click", removeSelected);
  $("btn-extract").addEventListener("click", extractSelected);
  els.download.addEventListener("click", downloadAll);
  $("btn-zoom-in").addEventListener("click", () => setZoom(state.zoom * 1.2));
  $("btn-zoom-out").addEventListener("click", () => setZoom(state.zoom / 1.2));
  $("btn-fit").addEventListener("click", () => {
    state.fit = true;
    render();
  });

  document.querySelectorAll(".panel-actions [data-action]").forEach((btn) => {
    const actions = { "rotate-right": () => rotate(90), duplicate, extract: extractSelected, delete: removeSelected };
    btn.addEventListener("click", () => actions[btn.dataset.action]());
  });

  els.fileName.addEventListener("input", () => {
    state.name = els.fileName.value;
    els.title.textContent = fileName();
  });

  els.emptyDrop.addEventListener("click", chooseFiles);
  els.emptyDrop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseFiles();
    }
  });

  setupDropTarget(els.workspace, (files) => addFiles(files, insertionIndex()));

  els.thumbs.addEventListener("click", (event) => {
    const item = event.target.closest(".thumb");
    if (!item) return;
    selectFromEvent(item.dataset.id, event);
    scrollToPage(item.dataset.id);
  });

  els.pages.addEventListener("click", (event) => {
    const page = event.target.closest(".vpage");
    if (page) selectFromEvent(page.dataset.id, event);
  });

  els.thumbs.addEventListener("focus", () => {
    if (!state.focusId && state.pages[0]) state.focusId = state.pages[0].id;
    renderSelection();
  });
  els.thumbs.addEventListener("blur", renderSelection);

  els.thumbs.addEventListener("keydown", (event) => {
    if (!state.pages.length) return;
    const vertical = event.key === "ArrowDown" || event.key === "ArrowUp";
    if (vertical && event.altKey) {
      event.preventDefault();
      moveSelectedBy(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (vertical || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const current = Math.max(0, indexOf(state.focusId));
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? state.pages.length - 1
            : current + (event.key === "ArrowDown" ? 1 : -1);
      const page = state.pages[Math.max(0, Math.min(state.pages.length - 1, next))];
      selectFromEvent(page.id, { shiftKey: event.shiftKey, metaKey: false, ctrlKey: false });
      if (!event.shiftKey) state.anchorId = page.id;
      $(`thumb-${page.id}`)?.scrollIntoView({ block: "nearest" });
      scrollToPage(page.id);
    } else if (event.key === " " && state.focusId) {
      event.preventDefault();
      selectFromEvent(state.focusId, { ctrlKey: true });
    }
  });

  let dragId = null;
  els.thumbs.addEventListener("dragstart", (event) => {
    const item = event.target.closest(".thumb");
    if (!item) return;
    dragId = item.dataset.id;
    if (!state.selected.has(dragId)) {
      state.selected = new Set([dragId]);
      state.anchorId = dragId;
      renderSelection();
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
    requestAnimationFrame(() =>
      els.thumbs
        .querySelectorAll(".thumb")
        .forEach((thumb) => thumb.classList.toggle("is-dragging", state.selected.has(thumb.dataset.id)))
    );
  });

  const clearDropMarks = () =>
    els.thumbs.querySelectorAll(".drop-before, .drop-after").forEach((item) => {
      item.classList.remove("drop-before", "drop-after");
    });

  els.thumbs.addEventListener("dragover", (event) => {
    if (!dragId) return;
    const item = event.target.closest(".thumb");
    if (!item) return;
    event.preventDefault();
    const rect = item.getBoundingClientRect();
    const horizontal = getComputedStyle(els.thumbs).flexDirection === "row";
    const after = horizontal
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    clearDropMarks();
    item.classList.add(after ? "drop-after" : "drop-before");
  });

  els.thumbs.addEventListener("drop", (event) => {
    if (!dragId) return;
    event.preventDefault();
    event.stopPropagation();
    const item = event.target.closest(".thumb");
    const after = item?.classList.contains("drop-after");
    clearDropMarks();
    if (item) moveSelectedTo(item.dataset.id, after);
  });

  els.thumbs.addEventListener("dragend", () => {
    dragId = null;
    clearDropMarks();
    els.thumbs.querySelectorAll(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
  });

  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input, textarea, [contenteditable]");
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && key === "s") {
      event.preventDefault();
      downloadAll();
      return;
    }
    if (mod && key === "o") {
      event.preventDefault();
      chooseFiles();
      return;
    }
    if (typing) return;

    if (mod && key === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (mod && key === "y") {
      event.preventDefault();
      redo();
    } else if (mod && key === "a" && state.pages.length) {
      event.preventDefault();
      state.selected = new Set(state.pages.map((page) => page.id));
      renderSelection();
    } else if (mod && key === "d") {
      event.preventDefault();
      duplicate();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (state.selected.size) {
        event.preventDefault();
        removeSelected();
      }
    } else if (key === "r" && !mod) {
      rotate(event.shiftKey ? -90 : 90);
    } else if ((event.key === "+" || event.key === "=") && !mod && state.pages.length) {
      setZoom(state.zoom * 1.2);
    } else if (event.key === "-" && !mod && state.pages.length) {
      setZoom(state.zoom / 1.2);
    } else if (event.key === "Escape" && state.selected.size) {
      state.selected.clear();
      renderSelection();
    }
  });
}
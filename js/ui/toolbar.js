// Sub-toolbar (Select all, page-size toggle) and the floating action bar
// shown when pages are selected. All mutations go through callbacks.
export function mountSubToolbar(root, opts = {}) {
  const { onSelectAll, onSizeChange } = opts;

  const selectAll = root.querySelector("#select-all");
  const sizeLarge = root.querySelector("#size-large");
  const sizeSmall = root.querySelector("#size-small");

  selectAll.addEventListener("click", () => {
    if (onSelectAll) onSelectAll();
  });
  sizeLarge.addEventListener("click", () => {
    if (onSizeChange) onSizeChange("large");
  });
  sizeSmall.addEventListener("click", () => {
    if (onSizeChange) onSizeChange("small");
  });

  return {
    setSize(size) {
      sizeLarge.classList.toggle("is-active", size === "large");
      sizeSmall.classList.toggle("is-active", size === "small");
    },
  };
}

export function mountFloatBar(root, opts = {}) {
  const { onRotate, onDuplicate, onExtract, onDelete } = opts;

  root.querySelector("#float-rotate").addEventListener("click", () => {
    if (onRotate) onRotate();
  });
  root.querySelector("#float-duplicate").addEventListener("click", () => {
    if (onDuplicate) onDuplicate();
  });
  root.querySelector("#float-extract").addEventListener("click", () => {
    if (onExtract) onExtract();
  });
  root.querySelector("#float-delete").addEventListener("click", () => {
    if (onDelete) onDelete();
  });

  return {
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
    setHidden(hidden) {
      root.hidden = !!hidden;
    },
    label(count) {
      root.querySelector("#float-label").textContent = `${count} selected`;
    },
  };
}

// Slide-out drawer for the right panel on narrow viewports (< 1100px).
// Traps focus lightly: opens with focus on the panel, returns focus to the
// toggle button on close, and closes on Escape or clicking the scrim.
export function mountDrawer(toggleBtn, panelEl, scrimEl) {
  let open = false;

  function openPanel() {
    open = true;
    panelEl.classList.add("open");
    scrimEl.classList.add("open");
    scrimEl.removeAttribute("hidden");
    toggleBtn.setAttribute("aria-expanded", "true");
    panelEl.setAttribute("tabindex", "-1");
    panelEl.focus();
  }

  function closePanel() {
    open = false;
    panelEl.classList.remove("open");
    scrimEl.classList.remove("open");
    scrimEl.setAttribute("hidden", "");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.focus();
  }

  toggleBtn.addEventListener("click", () => {
    if (open) closePanel(); else openPanel();
  });
  scrimEl.addEventListener("click", closePanel);
  window.addEventListener("keydown", (event) => {
    if (open && event.key === "Escape") closePanel();
  });

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => open,
  };
}

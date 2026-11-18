// Page grid: roving-tabindex listbox of page cards with Ctrl/Shift selection.
// Demo sheets only — real previews arrive in the next phase. All mutations go
// through callbacks so the store stays the single source of truth.
import { icon } from "../icons.js";

function lineShape(w) {
  return `<div class="shape line" data-w="${w}"></div>`;
}
function headingShape(w) {
  return `<div class="shape heading" data-w="${w}"></div>`;
}
function imageShape(h) {
  return `<div class="shape image variant-${h === 40 ? "small" : h === 90 ? "large" : "normal"}"></div>`;
}
function chartShape() {
  return `<div class="shape chart">
    <div class="bar" data-h="40"></div>
    <div class="bar dark" data-h="65"></div>
    <div class="bar" data-h="50"></div>
    <div class="bar dark" data-h="90"></div>
  </div>`;
}

// Apply data-* presentational attributes through the CSSOM. element.style
// assignments are script-driven, so the strict CSP (style-src 'self', no
// 'unsafe-inline') does not block them — unlike inline style attributes.
function applySheetStyles(sheet) {
  const rotate = sheet.dataset.rotate;
  if (rotate !== undefined) sheet.style.setProperty("--rotate", `${rotate}deg`);
  for (const shape of sheet.querySelectorAll("[data-w]")) {
    shape.style.width = `${shape.dataset.w}%`;
  }
  for (const shape of sheet.querySelectorAll("[data-h]")) {
    shape.style.height = `${shape.dataset.h}%`;
  }
}

// Seven varied demo sheets so the demo grid isn't repetitive.
const DEMO_SHEETS = [
  [lineShape(60), headingShape(52), imageShape(40), chartShape()],
  [lineShape(90), imageShape(58), chartShape()],
  [headingShape(44), imageShape(40), lineShape(44)],
  [chartShape(), imageShape(90), headingShape(58)],
  [lineShape(58), imageShape(58), lineShape(78)],
  [headingShape(52), chartShape(), imageShape(40)],
  [imageShape(90), lineShape(66), headingShape(48)],
];

export function mountGrid(gridEl, addTileEl, workareaEl, opts = {}) {
  const {
    getState,
    onToggle,
    onSelectAll,
    onSelectNone,
    onSelectRange,
    onFocus,
    onFocusNext,
    onSizeChange,
    onAdd,
  } = opts;

  function sheetHtml(page, index) {
    const parts = DEMO_SHEETS[index % DEMO_SHEETS.length].join("");
    return `<div class="sheet" data-rotate="${page.rotated}">${parts}</div>`;
  }

  // Cards keyed by page id for incremental renders; re-entrancy guard for
  // render() so a focus() inside render() can never loop back into render().
  const cards = new Map();
  let rendering = false;

  function buildCard(page, number, selected, focusedId, index) {
    const card = document.createElement("div");
    card.className = "page-card";
    card.setAttribute("role", "option");
    card.setAttribute("aria-label", `Page ${number}`);
    card.tabIndex = page.id === focusedId ? 0 : -1;
    card.dataset.id = page.id;
    card.dataset.number = number;
    card.dataset.index = index;
    if (selected.has(page.id)) card.setAttribute("aria-selected", "true");
    card.insertAdjacentHTML("beforeend", sheetHtml(page, index));
    applySheetStyles(card.querySelector(".sheet"));
    const num = document.createElement("span");
    num.className = "page-number";
    num.textContent = number;
    card.appendChild(num);
    const check = document.createElement("div");
    check.className = "check";
    check.innerHTML = icon("check");
    check.setAttribute("aria-hidden", "true");
    card.appendChild(check);
    card.addEventListener("focus", () => {
      // Roving tabindex in place; never call renderAll() or rebuild DOM here
      // so a card clicked between mousedown and mouseup keeps its click.
      const current = gridEl.querySelector('[tabindex="0"]');
      if (current && current !== card) current.tabIndex = -1;
      card.tabIndex = 0;
      onFocus?.(card.dataset.id);
    });
    return card;
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      const state = getState();
      const pages = state.pages;
      const selected = new Set(state.selected);
      const targetIds = new Set(pages.map((page) => page.id));

      // Drop cards for pages that no longer exist.
      for (const [id, card] of cards) {
        if (!targetIds.has(id)) {
          card.remove();
          cards.delete(id);
        }
      }

      // Reuse existing cards, moving them into the current order; build only
      // new ones. Appending a node already in the DOM moves it without
      // destroying it, so a card clicked between mousedown and mouseup keeps
      // its click event. Selection, focus and size changes update in place.
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const number = index + 1;
        let card = cards.get(page.id);
        if (!card) {
          card = buildCard(page, number, selected, state.focusedId, index);
          cards.set(page.id, card);
        } else {
          syncCard(card, page, number, selected, state.focusedId, index);
        }
        gridEl.appendChild(card);
      }
      gridEl.appendChild(addTileEl);

      workareaEl.classList.toggle("size-small", state.size === "small");

      // Move focus only when focus is inside the grid (or was lost, e.g. the
      // focused page was deleted) and the target card is not already focused.
      const focusInsideGrid = gridEl.contains(document.activeElement);
      if (
        state.focusedId != null &&
        (focusInsideGrid || document.activeElement === document.body)
      ) {
        const focusEl = gridEl.querySelector(`[data-id="${state.focusedId}"]`);
        if (focusEl && focusEl !== document.activeElement) focusEl.focus();
      }
    } finally {
      rendering = false;
    }
  }

  function syncCard(card, page, number, selected, focusedId, index) {
    card.tabIndex = page.id === focusedId ? 0 : -1;
    if (selected.has(page.id)) card.setAttribute("aria-selected", "true");
    else card.removeAttribute("aria-selected");
    card.dataset.number = number;
    card.dataset.index = index;
    card.setAttribute("aria-label", `Page ${number}`);
    card.querySelector(".page-number").textContent = number;
    applySheetStyles(card.querySelector(".sheet"));
  }

  gridEl.addEventListener("click", (event) => {
    const card = event.target.closest(".page-card");
    if (!card) return;
    card.focus();
    const state = getState();
    if (event.shiftKey) {
      onSelectRange(Number(card.dataset.number) - 1);
    } else {
      onToggle(card.dataset.id);
    }
  });

  gridEl.addEventListener("keydown", (event) => {
    const card = event.target.closest(".page-card");
    if (!card) return;
    const state = getState();
    const idx = Number(card.dataset.number) - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        if (event.shiftKey) onSelectRange(clamp(idx + 1, state.pages.length));
        else onFocusNext(clamp(idx + 1, state.pages.length));
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        if (event.shiftKey) onSelectRange(clamp(idx - 1, state.pages.length));
        else onFocusNext(clamp(idx - 1, state.pages.length));
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        onToggle(card.dataset.id);
        break;
    }
  });

  addTileEl.addEventListener("click", () => {
    onAdd?.();
  });

  return { render };

  function clamp(i, length) {
    return Math.max(0, Math.min(length - 1, i));
  }
}

export function buildSkeletons(count, container) {
  container.textContent = "";
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "skeleton-card";
    container.appendChild(el);
  }
}

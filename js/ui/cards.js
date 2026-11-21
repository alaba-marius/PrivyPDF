// Page grid: roving-tabindex listbox of real page cards with Ctrl/Shift
// selection, lazy thumbnail rendering through an IntersectionObserver with an
// LRU bitmap cache, and pointer-drag reordering of the selected block. All
// mutations go through callbacks so the store stays the single source of truth.
import { effectiveRotation, moveSelected } from "../core/pages.js";
import {
  sheetHtml,
  applySheetStyles,
  checkMarkup,
  fitSize,
  rotationScale,
} from "../core/card-view.js";
import { createThumbnailScheduler } from "../core/thumbs.js";

// Cached thumbnails: oldest entries are evicted and their bitmaps freed so
// long documents stay within a bounded memory budget.
const DRAG_THRESHOLD = 6;
const TOUCH_HOLD_MS = 350;

// Build skeleton card shells into `container` so the grid shows shimmer
// placeholders while pages load. Each shell reuses sheetHtml so skeletons
// match real cards structurally (no browser check needed here).
export function buildSkeletons(count, container) {
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "page-card";
    card.setAttribute("aria-hidden", "true");
    card.tabIndex = -1;
    card.insertAdjacentHTML("beforeend", sheetHtml({ index: 0, baseRotation: 0, rotated: 0 }));
    container.appendChild(card);
  }
}

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
    onMoveTo,
    renderThumbnail,
    getSourceName,
  } = opts;

  const cards = new Map(); // page id -> card element
  let rendering = false;

  // ---------- Thumbnail scheduler ----------

  const scheduler = createThumbnailScheduler({
    renderThumbnail,
    onReady: (pageId, key, bitmap) => {
      const card = cards.get(pageId);
      if (!card) {
        bitmap.close();
        return;
      }
      if (card.dataset.thumbKey !== key) {
        bitmap.close();
        return;
      }
      const canvas = card.querySelector(".page-canvas");
      const skeleton = card.querySelector(".thumb-skeleton");
      const ctx = canvas.getContext("2d");
      // Draw the bitmap at its fitted size, centered in the sheet page — never
      // stretched to fill it.
      const { width: dw, height: dh } = fitSize(bitmap.width, bitmap.height, canvas.width, canvas.height);
      ctx.drawImage(bitmap, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      skeleton?.remove();
      canvas.hidden = false;
    },
  });

  function requestThumb(card) {
    const pageId = card.dataset.id;
    const box = card.querySelector(".ds-sheet-page");
    if (!box) return;
    // Layout size: transforms (rotate/scale) do not change offsetWidth /
    // offsetHeight, so re-syncing can never shrink the page.
    const dw = box.offsetWidth;
    const dh = box.offsetHeight;
    if (dw <= 0 || dh <= 0) return;
    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
    const key = `${card.dataset.source}:${card.dataset.index}:${dw}x${dh}`;
    if (card.dataset.thumbKey === key) return;
    const canvas = card.querySelector(".page-canvas");
    canvas.width = dw * dpr;
    canvas.height = dh * dpr;
    card.dataset.thumbKey = key;
    scheduler.show(pageId, key);
  }

  // Release a card's thumbnail canvas while it is outside the render margin:
  // back to a 1x1 canvas (no bitmap allocated), skeleton shown again, and
  // thumbKey cleared so requestThumb re-sizes and re-renders (from cache when
  // possible) when the card scrolls back in. Keeps the count of sized canvases
  // bounded by the cards inside the margin instead of every card ever scrolled
  // past.
  function resetCard(card) {
    if (!card.dataset.thumbKey) return; // nothing rendered to release
    const canvas = card.querySelector(".page-canvas");
    const skeleton = card.querySelector(".thumb-skeleton");
    const sheet = card.querySelector(".ds-sheet-page");
    canvas.width = 1;
    canvas.height = 1;
    canvas.hidden = true;
    card.dataset.thumbKey = "";
    if (!skeleton && sheet) {
      const s = document.createElement("div");
      s.className = "thumb-skeleton ds-skeleton";
      s.setAttribute("aria-hidden", "true");
      sheet.insertBefore(s, canvas);
    }
  }

  // The observer root must be the scroll container (#grid-wrap), not the grid
  // itself. #page-grid is a tall non-scrolling column, so using it as the root
  // makes every card intersect at once and all thumbnails render on load.
  const scrollEl = gridEl.closest("#grid-wrap") ?? gridEl;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pageId = entry.target.dataset.id;
        if (!pageId) continue;
        if (entry.isIntersecting) {
          const card = cards.get(pageId);
          if (card) requestThumb(card);
        } else {
          scheduler.hide(pageId);
          const card = cards.get(pageId);
          if (card) resetCard(card);
        }
      }
    },
    { root: scrollEl, rootMargin: "600px" },
  );

  const mutation = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.matches(".page-card")) observer.observe(node);
      }
      for (const node of m.removedNodes) {
        if (node.nodeType === 1 && node.matches(".page-card")) {
          scheduler.hide(node.dataset.id);
          observer.unobserve(node);
        }
      }
    }
  });
  mutation.observe(gridEl, { childList: true, subtree: true });

  // ---------- Card building ----------

  function buildCard(page, number, selected, focusedId, index) {
    const card = document.createElement("div");
    card.className = "page-card";
    card.setAttribute("role", "option");
    card.setAttribute("aria-label", `Page ${number}`);
    card.tabIndex = page.id === focusedId ? 0 : -1;
    card.dataset.id = page.id;
    card.dataset.source = page.sourceId;
    card.dataset.index = page.index;
    card.dataset.number = number;
    if (selected.has(page.id)) card.setAttribute("aria-selected", "true");
    card.insertAdjacentHTML("beforeend", sheetHtml(page));
    if (selected.has(page.id)) {
      const sheet = card.querySelector(".ds-sheet");
      sheet.classList.add("ds-sheet--selected");
      sheet.insertAdjacentHTML("beforeend", checkMarkup());
    }
    const num = document.createElement("span");
    num.className = "page-number";
    num.textContent = number;
    card.appendChild(num);

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

  function toggleCheck(sheet, on) {
    const check = sheet.querySelector(".ds-check");
    if (on && !check) sheet.insertAdjacentHTML("beforeend", checkMarkup());
    if (!on && check) check.remove();
  }

  function syncCard(card, page, number, selected, focusedId, index, total) {
    card.tabIndex = page.id === focusedId ? 0 : -1;
    if (selected.has(page.id)) card.setAttribute("aria-selected", "true");
    else card.removeAttribute("aria-selected");
    card.dataset.number = number;
    const sourceName = getSourceName ? getSourceName(page.sourceId) : "";
    let label = `Page ${number} of ${total} from ${sourceName}`;
    const rotate = effectiveRotation(page);
    if (rotate) label += `, rotated ${rotate} degrees`;
    card.setAttribute("aria-label", label);
    card.querySelector(".page-number").textContent = number;

    const sheet = card.querySelector(".ds-sheet");
    const box = card.querySelector(".ds-sheet-page");
    const boxW = box.offsetWidth;
    const boxH = box.offsetHeight;
    // rotationScale derives the fit scale from the effective rotation (the file's
    // own /Rotate plus the user rotation): effective 0/180 is scale 1, effective
    // 90/270 scales the fitted page down so the rotated bitmap fits the box.
    // page.rotated is the user rotation, baseRotation is the file's own /Rotate.
    const scale =
      boxW > 0 && boxH > 0
        ? rotationScale(page.rotated, page.width, page.height, page.baseRotation, boxW, boxH)
        : 1;
    sheet.dataset.rotate = rotate;
    sheet.classList.toggle("ds-sheet--selected", selected.has(page.id));
    toggleCheck(sheet, selected.has(page.id));
    applySheetStyles(sheet, { rotate, scale });
  }

  // ---------- Render ----------

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
          scheduler.hide(id);
          observer.unobserve(card);
          card.remove();
          cards.delete(id);
        }
      }

      // Reuse existing cards, moving them into the current order; build only
      // new ones. Appending a node already in the DOM moves it without
      // destroying it, so a card clicked between mousedown and mouseup keeps
      // its click event. Selection, focus, size and rotation update in place.
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const number = index + 1;
        let card = cards.get(page.id);
        if (!card) {
          card = buildCard(page, number, selected, state.focusedId, index);
          cards.set(page.id, card);
        }
        gridEl.appendChild(card);
        syncCard(card, page, number, selected, state.focusedId, index, pages.length);
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

  // ---------- Selection / focus ----------

  gridEl.addEventListener("click", (event) => {
    if (justDragged) {
      justDragged = false;
      return;
    }
    if (event.target.closest(".drag-ghost")) return;
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
    if (event.altKey) return; // Alt+Arrow moves pages, handled page-wide.
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

  // ---------- Pointer-drag reorder ----------

  let drag = null;
  let justDragged = false;
  let scrollFrame = null;

  function pointerDown(event) {
    if (event.button !== 0) return;
    const card = event.target.closest(".page-card");
    if (!card) return;
    const state = getState();
    const id = card.dataset.id;
    const items = state.selected.includes(id) ? state.selected : [id];
    drag = {
      card,
      id,
      items,
      start: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      timer:
        event.pointerType === "touch"
          ? setTimeout(() => beginDrag(event.clientX, event.clientY), TOUCH_HOLD_MS)
          : null,
      active: false,
    };
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerCancel);
  }

  function pointerMove(event) {
    if (!drag) return;
    const dx = Math.abs(event.clientX - drag.start.x);
    const dy = Math.abs(event.clientY - drag.start.y);
    if (drag.active) {
      event.preventDefault();
      drag.lastY = event.clientY;
      moveGhost(event.clientX, event.clientY);
      return;
    }
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) beginDrag(event.clientX, event.clientY);
  }

  function beginDrag(x, y) {
    if (drag.timer) {
      clearTimeout(drag.timer);
      drag.timer = null;
    }
    if (drag.active) return;
    drag.active = true;

    const card = drag.card;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.position = "fixed";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "100";
    ghost.style.opacity = "0.85";
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    gridEl.appendChild(ghost);

    const marker = document.createElement("div");
    marker.className = "insertion-marker";
    marker.style.position = "absolute";
    marker.style.width = "4px";
    marker.style.background = "var(--color-electric-capture-blue)";
    marker.style.pointerEvents = "none";
    marker.style.zIndex = "99";
    gridEl.appendChild(marker);

    // Dim the dragged pages in place while the ghost is shown.
    drag.items.forEach((id) => {
      const dragged = gridEl.querySelector(`.page-card[data-id="${id}"]`);
      if (dragged) dragged.style.opacity = "0.45";
    });

    Object.assign(drag, {
      ghost,
      marker,
      offsetX: x - rect.left,
      offsetY: y - rect.top,
    });
    moveGhost(x, y);
    startScrollLoop();
  }

  function moveGhost(x, y) {
    drag.ghost.style.left = x - drag.offsetX + "px";
    drag.ghost.style.top = y - drag.offsetY + "px";

    let before = 0;
    let targetCard = null;
    const ordered = [];
    for (const card of gridEl.querySelectorAll(".page-card")) {
      if (drag.items.includes(card.dataset.id)) continue;
      ordered.push(card);
      const rect = card.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        targetCard = card;
        break;
      }
      before++;
    }
    drag.insertIndex = before;

    const columnGap = (parseFloat(getComputedStyle(gridEl).columnGap || "32px") || 32) / 2;
    const gridRect = gridEl.getBoundingClientRect();
    const refCard = targetCard || gridEl.querySelector(".page-card:last-of-type");
    const sheet = refCard ? refCard.querySelector(".ds-sheet") : null;
    drag.marker.style.height = (sheet ? sheet.offsetHeight : 254) + "px";

    // Distance (px) between a card edge and the insertion marker.
    const MARKER_INSET = 4;

    if (targetCard) {
      const rect = targetCard.getBoundingClientRect();
      const prevCard = before > 0 ? ordered[before - 1] : null;
      if (prevCard && prevCard.getBoundingClientRect().top !== rect.top) {
        // targetCard starts a new row, so the cursor is at a row boundary:
        // either after the last card of the previous row or before the first
        // card of this row. Place the marker on the edge of the row the
        // cursor is vertically closer to, in the same row (3-6px from the
        // card) instead of one row below the target.
        const prevRect = prevCard.getBoundingClientRect();
        const gapMid = (prevRect.bottom + rect.top) / 2;
        if (y < gapMid) {
          // Drop after the last card of the previous row: right edge, same row.
          drag.marker.style.top = prevRect.top - gridRect.top + "px";
          drag.marker.style.left = prevRect.right - gridRect.left + MARKER_INSET + "px";
        } else {
          // Drop before the first card of this row: left edge, same row.
          drag.marker.style.top = rect.top - gridRect.top + "px";
          drag.marker.style.left = rect.left - gridRect.left - MARKER_INSET - 4 + "px";
        }
      } else {
        drag.marker.style.top = rect.top - gridRect.top + "px";
        // Center the bar in the column gap before the target card. At a row
        // start that lands at the grid's leading edge; at the very end it sits
        // one half-gap past the last card.
        drag.marker.style.left = Math.max(0, rect.left - gridRect.left - columnGap - 2) + "px";
      }
    } else if (refCard) {
      const rect = refCard.getBoundingClientRect();
      drag.marker.style.top = rect.top - gridRect.top + "px";
      drag.marker.style.left = rect.right - gridRect.left + columnGap - 2 + "px";
    } else {
      drag.marker.style.top = "0";
      drag.marker.style.left = "0";
    }
  }

  function startScrollLoop() {
    cancelAnimationFrame(scrollFrame);
    function step() {
      if (!drag || !drag.active) return;
      const rect = gridEl.getBoundingClientRect();
      const y = drag.lastY;
      if (y < rect.top + 40) gridEl.scrollTop -= 16;
      else if (y > rect.bottom - 40) gridEl.scrollTop += 16;
      scrollFrame = requestAnimationFrame(step);
    }
    scrollFrame = requestAnimationFrame(step);
  }

  function endDrag() {
    cancelAnimationFrame(scrollFrame);
    drag?.ghost?.remove();
    drag?.marker?.remove();
    if (drag?.timer) clearTimeout(drag.timer);
    if (drag) {
      drag.items.forEach((id) => {
        const dragged = gridEl.querySelector(`.page-card[data-id="${id}"]`);
        if (dragged) dragged.style.opacity = "";
      });
    }
    drag = null;
  }

  function pointerUp(event) {
    if (!drag) return;
    const wasActive = drag.active;
    const insertIndex = drag.insertIndex;
    endDrag();
    if (wasActive) {
      event.preventDefault();
      justDragged = true;
      if (insertIndex != null && onMoveTo) onMoveTo(insertIndex);
    }
  }

  function pointerCancel() {
    endDrag();
  }

  gridEl.addEventListener("pointerdown", pointerDown);

  return { render };

  function clamp(i, length) {
    return Math.max(0, Math.min(length - 1, i));
  }
}

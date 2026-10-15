import { icon } from "./icons.js";

const MENUS = [
  {
    id: "product",
    label: "Product",
    items: [
      { href: "/editor.html", icon: "layers", title: "Page editor", desc: "Reorder, rotate and delete pages" },
      { href: "/editor.html", icon: "file-plus", title: "Merge PDFs", desc: "Combine files into one document" },
      { href: "/editor.html", icon: "image", title: "Images to PDF", desc: "Turn JPG and PNG into pages" },
      { href: "/editor.html", icon: "scissors", title: "Extract pages", desc: "Save a selection as a new PDF" },
      { href: "/editor.html", icon: "pen", title: "Annotate", desc: "Text, drawing, highlights and erasing" },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    narrow: true,
    items: [
      { href: "/privacy.html", icon: "shield-check", title: "Privacy model", desc: "How on-device processing works" },
      { href: "/privacy.html#verify", icon: "eye", title: "Verify it yourself", desc: "Watch the network tab stay empty" },
      { href: "/#how", icon: "cpu", title: "How it works", desc: "pdf.js and pdf-lib, in your browser" },
      { href: "/#faq", icon: "help", title: "FAQ", desc: "Answers to common questions" },
    ],
  },
];

function menuHTML(menu) {
  const links = menu.items
    .map(
      (it) => `
      <a class="menu-link" role="menuitem" href="${it.href}">
        <span class="menu-icon">${icon(it.icon)}</span>
        <span>
          <span class="menu-title">${it.title}${it.soon ? '<span class="badge badge-muted">Soon</span>' : ""}</span>
          <span class="menu-desc">${it.desc}</span>
        </span>
      </a>`
    )
    .join("");
  return `
    <div class="nav-item">
      <button class="nav-trigger" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="menu-${menu.id}">
        ${menu.label}${icon("chevron-down")}
      </button>
      <div class="nav-menu${menu.narrow ? " is-narrow" : ""}" id="menu-${menu.id}" role="menu" aria-label="${menu.label}">
        ${links}
      </div>
    </div>`;
}

export function mountNavbar(target, { showCta = true, isStatic = false } = {}) {
  target.classList.add("site-header");
  if (isStatic) target.classList.add("is-static");
  target.innerHTML = `
    <nav class="nav" aria-label="Main">
      <a class="nav-logo" href="/" aria-label="PrivyPDF home">
        <img class="brand-logo" src="/assets/privypdf-logo.png" alt="PrivyPDF" />
      </a>
      ${MENUS.map(menuHTML).join("")}
      ${showCta ? `<a class="nav-cta" href="/editor.html">Open editor</a>` : ""}
    </nav>`;

  const items = [...target.querySelectorAll(".nav-item")];
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let hoverTimer;

  const close = (item, focusTrigger = false) => {
    const trigger = item.querySelector(".nav-trigger");
    trigger.setAttribute("aria-expanded", "false");
    item.querySelector(".nav-menu").classList.remove("is-open");
    if (focusTrigger) trigger.focus();
  };
  const closeAll = (except) => items.forEach((it) => it !== except && close(it));
  const open = (item) => {
    closeAll(item);
    item.querySelector(".nav-trigger").setAttribute("aria-expanded", "true");
    item.querySelector(".nav-menu").classList.add("is-open");
  };
  const isOpen = (item) => item.querySelector(".nav-trigger").getAttribute("aria-expanded") === "true";

  items.forEach((item) => {
    const trigger = item.querySelector(".nav-trigger");
    const links = () => [...item.querySelectorAll(".menu-link")];

    trigger.addEventListener("click", () => (isOpen(item) ? close(item) : open(item)));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        open(item);
        links()[0]?.focus();
      }
    });

    item.addEventListener("keydown", (e) => {
      const list = links();
      const idx = list.indexOf(document.activeElement);
      if (e.key === "Escape") close(item, true);
      else if (e.key === "ArrowDown" && idx > -1) {
        e.preventDefault();
        list[(idx + 1) % list.length].focus();
      } else if (e.key === "ArrowUp" && idx > -1) {
        e.preventDefault();
        list[(idx - 1 + list.length) % list.length].focus();
      }
    });

    item.addEventListener("focusout", (e) => {
      if (!item.contains(e.relatedTarget)) close(item);
    });

    if (canHover) {
      item.addEventListener("pointerenter", () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => open(item), 60);
      });
      item.addEventListener("pointerleave", () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => close(item), 140);
      });
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!target.contains(e.target)) closeAll();
  });
}

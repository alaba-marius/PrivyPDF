import { icon } from "./icons.js";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#tools", label: "Tools" },
  { href: "/privacy.html", label: "Privacy" },
  { href: "/#faq", label: "FAQ" },
];

function currentHref() {
  return location.pathname + location.hash;
}

function linkHTML(link) {
  const current = currentHref();
  const currentLink =
    link.href === current || (link.href === "/" && current === "/");
  const currentAttr = currentLink ? ' aria-current="page"' : "";
  return `<a class="ds-nav-link"${currentAttr} href="${link.href}">${link.label}</a>`;
}

function linksHTML() {
  return LINKS.map(linkHTML).join("");
}

export function mountNavbar(target, { showCta = true, isStatic = false } = {}) {
  target.classList.add("site-header");
  if (isStatic) target.classList.add("is-static");
  const cta = showCta
    ? `<a class="ds-nav-cta ds-btn ds-btn--primary" href="/editor.html">Open the editor</a>`
    : "";
  target.innerHTML = `
    <nav class="ds-nav" aria-label="Main">
      <a class="ds-nav-brand" href="/" aria-label="PrivyPDF home">
        <span class="ds-nav-mark"><i class="ds-icon" data-icon="file-text"></i></span>
        <span class="ds-nav-wordmark">Privy<strong>PDF</strong></span>
      </a>
      <div class="ds-nav-center">
        <div class="ds-nav-links">${linksHTML()}</div>
      </div>
      ${cta}
      <button class="ds-nav-menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="ds-nav-menu">
        ${icon("menu", "ds-icon")}
      </button>
    </nav>
    <div class="ds-nav-panel" id="ds-nav-menu" role="menu" aria-label="Main menu">
      ${linksHTML()}
    </div>
  `;

  const menuBtn = target.querySelector(".ds-nav-menu-btn");
  const panel = document.getElementById("ds-nav-menu");
  const links = [...document.querySelectorAll(".ds-nav-link")];
  let open = false;

  function toggle() {
    open = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    panel.classList.toggle("is-open", open);
    if (open) panel.querySelector(".ds-nav-link")?.focus();
  }

  function closeWithFocus() {
    open = false;
    menuBtn.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");
    menuBtn.focus();
  }

  menuBtn.addEventListener("click", toggle);
  menuBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
    if (e.key === "ArrowDown" && panel.classList.contains("is-open")) {
      e.preventDefault();
      links[0]?.focus();
    }
  });

  links.forEach((link) => {
    link.addEventListener("click", closeWithFocus);
    link.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeWithFocus();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeWithFocus();
  });

  document.addEventListener("pointerdown", (e) => {
    if (
      open &&
      !panel.contains(e.target) &&
      !menuBtn.contains(e.target)
    ) {
      closeWithFocus();
    }
  });
}

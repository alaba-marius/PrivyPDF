import { mountNavbar } from "./navbar.js";
import { hydrateIcons } from "./icons.js";

export function initSite(navOptions) {
  const header = document.querySelector("[data-navbar]");
  if (header) mountNavbar(header, navOptions);

  document.querySelectorAll("[data-logo]").forEach((el) => {
    el.innerHTML =
      '<span class="footer-brand-mark" aria-hidden="true"><i data-icon="file-text"></i></span>' +
      '<span class="footer-brand-name">Privy<strong>PDF</strong></span>';
  });

  hydrateIcons();
}

import { mountNavbar } from "./navbar.js";
import { hydrateIcons } from "./icons.js";

export function initSite(navOptions) {
  const header = document.querySelector("[data-navbar]");
  if (header) mountNavbar(header, navOptions);

  document.querySelectorAll("[data-logo]").forEach((el) => {
    el.innerHTML =
      '<span class="footer-brand-mark" aria-hidden="true"><i data-icon="file-text"></i></span>' +
      '<span class="footer-brand-name">Privy<span>PDF</span></span>';
  });

  hydrateIcons();

  const reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -60px 0px" }
  );
  reveals.forEach((el) => io.observe(el));
}

import { icon } from "./icons.js";

let region;

function getRegion() {
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  return region;
}

export function toast(message, { type = "success", duration = 3200 } = {}) {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " is-error" : ""}`;
  el.innerHTML = `${icon(type === "error" ? "alert" : "check")}<span></span>`;
  el.querySelector("span").textContent = message;
  getRegion().appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 220);
  }, duration);
}

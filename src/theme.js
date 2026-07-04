// Light/dark theme toggle.

import { $ } from "./dom.js";
import { updateWires } from "./wires.js";

const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`;

export function applyThemeIcon() {
  const light = document.documentElement.dataset.theme === "light";
  $("#themeBtn").innerHTML = light ? MOON : SUN;
  $("#themeBtn").title = light ? "Switch to dark" : "Switch to light";
}

$("#themeBtn").onclick = () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyThemeIcon(); updateWires();
};

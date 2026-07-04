// Shared DOM helpers and element references.
// This module runs after the DOM is parsed (module scripts are deferred),
// so top-level querySelector calls are safe.

export const $ = (s) => document.querySelector(s);
export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export const canvas = $("#canvas");
export const world = $("#world");
export const svg = $("#wires");

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function sanitize(s) {
  return String(s || "").trim().replace(/[^\w$]/g, "_").replace(/^(\d)/, "_$1");
}
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function download(text, name, type = "text/plain") {
  const blob = new Blob([text], { type }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

let _toastT;
export function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove("show"), 1800);
}

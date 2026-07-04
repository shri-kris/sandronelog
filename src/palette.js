// Palette rail: primitive blocks (from the registry) + a "New module" source +
// a dynamic "Modules" group listing existing definitions to instantiate.
// Drops carry a token: "prim:<type>", "mod:<id>", or "newmod".

import { $, canvas, toast } from "./dom.js";
import { state } from "./state.js";
import { blockTypes, CATEGORIES, MODULE_GLYPH } from "./blockTypes.js";
import { screenToWorld } from "./wires.js";
import { addBlock } from "./model.js";
import { createModule, addInstance, openTab, wouldCreateCycle, deleteModule } from "./sheets.js";

function handleDrop(clientX, clientY, token) {
  const w = screenToWorld(clientX, clientY);
  const x = w.x - 94, y = w.y - 40;
  if (token === "newmod") {
    const m = createModule(); addInstance(m.id, { x, y }); openTab(m.id);
  } else if (token.startsWith("mod:")) {
    const ref = token.slice(4);
    if (wouldCreateCycle(state.activeId, ref)) { toast("Can't place a module inside itself"); return; }
    addInstance(ref, { x, y });
  } else if (token.startsWith("prim:")) {
    addBlock({ type: token.slice(5), x, y });
  }
}

function item(token, glyph, label, deletable) {
  const del = deletable ? `<span class="pdel" data-del="${token.slice(4)}" title="Delete module (and all instances)">✕</span>` : "";
  return `<button class="palette-item" draggable="true" data-token="${token}" title="Drag onto the canvas, or click to drop one">
    <span class="pi-glyph">${glyph}</span><span class="pi-label">${label}</span>${del}</button>`;
}

export function renderPaletteItems() {
  const host = $("#palette");
  const byCat = {};
  for (const id in blockTypes) (byCat[blockTypes[id].category] ||= []).push(blockTypes[id]);

  let html = "";
  for (const cat of CATEGORIES) {
    const items = byCat[cat] || [];
    if (cat !== "Sources" && !items.length) continue;
    html += `<div class="pgroup">${cat}</div>`;
    if (cat === "Sources") html += item("newmod", MODULE_GLYPH, "New module", false);
    html += items.map((t) => item(`prim:${t.id}`, t.glyph || "", t.label, false)).join("");
  }
  // dynamic Modules group: defs instantiable on the active sheet (no cycles)
  const mods = state.order.map((id) => state.modules[id]).filter(Boolean)
    .filter((m) => !wouldCreateCycle(state.activeId, m.id));
  html += `<div class="pgroup">Modules</div>`;
  html += mods.length
    ? mods.map((m) => item(`mod:${m.id}`, MODULE_GLYPH, m.name, true)).join("")
    : `<div class="pmuted">Drop a New module to start</div>`;
  host.innerHTML = html;

  host.querySelectorAll(".palette-item").forEach((el) => {
    const token = el.dataset.token;
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", token); e.dataTransfer.effectAllowed = "copy"; });
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-del]")) return;
      const rect = canvas.getBoundingClientRect();
      handleDrop(rect.left + rect.width / 2, rect.top + rect.height / 2, token);
    });
  });
  host.querySelectorAll("[data-del]").forEach((el) =>
    el.addEventListener("click", (e) => { e.stopPropagation(); deleteModule(el.dataset.del); }));
}

export function mountPalette() {
  renderPaletteItems();
  canvas.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; canvas.classList.add("dragover"); });
  canvas.addEventListener("dragleave", (e) => { if (e.target === canvas) canvas.classList.remove("dragover"); });
  canvas.addEventListener("drop", (e) => {
    e.preventDefault(); canvas.classList.remove("dragover");
    const token = e.dataTransfer.getData("text/plain") || "";
    if (token) handleDrop(e.clientX, e.clientY, token);
  });
}

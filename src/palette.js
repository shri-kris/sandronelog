// Palette rail: generated from the block-type registry, grouped by category.
// Items support drag-to-place and click-to-drop-at-center.

import { $, canvas } from "./dom.js";
import { blockTypes, CATEGORIES } from "./blockTypes.js";
import { screenToWorld } from "./wires.js";
import { addBlock } from "./model.js";

function dropAt(clientX, clientY, type) {
  const w = screenToWorld(clientX, clientY);
  addBlock({ type, x: w.x - 94, y: w.y - 40 });
}

export function mountPalette() {
  const host = $("#palette");
  const byCat = {};
  for (const id in blockTypes) (byCat[blockTypes[id].category] ||= []).push(blockTypes[id]);

  let html = "";
  for (const cat of CATEGORIES) {
    const items = byCat[cat]; if (!items || !items.length) continue;
    html += `<div class="pgroup">${cat}</div>`;
    html += items.map((t) => `
      <button class="palette-item" draggable="true" data-type="${t.id}" title="Drag onto the canvas, or click to drop one">
        <span class="pi-glyph">${t.glyph || ""}</span><span class="pi-label">${t.label}</span>
      </button>`).join("");
  }
  host.innerHTML = html;

  host.querySelectorAll(".palette-item").forEach((el) => {
    const type = el.dataset.type;
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", type); e.dataTransfer.effectAllowed = "copy"; });
    el.addEventListener("click", () => {
      const rect = canvas.getBoundingClientRect();
      dropAt(rect.left + rect.width / 2, rect.top + rect.height / 2, type);
    });
  });

  canvas.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; canvas.classList.add("dragover"); });
  canvas.addEventListener("dragleave", (e) => { if (e.target === canvas) canvas.classList.remove("dragover"); });
  canvas.addEventListener("drop", (e) => {
    e.preventDefault(); canvas.classList.remove("dragover");
    const type = e.dataTransfer.getData("text/plain") || "module";
    dropAt(e.clientX, e.clientY, type);
  });
}

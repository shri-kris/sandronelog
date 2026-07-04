// Rendering: block DOM (primitive vs module-instance), pins, and the per-sheet
// interface-ports panel.

import { state, portDots, session } from "./state.js";
import { $, world, esc } from "./dom.js";
import { typeOf } from "./blockTypes.js";
import { removeBlock, select, tportById, removeTPort } from "./model.js";
import { updateWires } from "./wires.js";
import { refreshSV } from "./codegen.js";
import { beginRoute } from "./routing.js";
import { startBlockDrag } from "./interactions.js";
import { renameModule, openTab, reconcileInstances } from "./sheets.js";

export function positionBlock(b) { b._el.style.left = b.x + "px"; b._el.style.top = b.y + "px"; }

export function renderBlock(b) {
  const isInstance = b.kind === "instance";
  const el = document.createElement("div");
  el.className = "block " + (isInstance ? "instance" : "primitive");
  el.dataset.id = b.id;

  let headInner;
  if (isInstance) {
    const def = state.modules[b.ref];
    headInner = `<span class="grip"></span>
      <input class="mname" value="${esc(def?.name || "module")}" spellcheck="false" data-mname>
      <button class="bhbtn bopen" title="Open module canvas" data-bopen>⤢</button>
      <button class="bhbtn bdel" title="Delete instance" data-bdel>✕</button>`;
  } else {
    const type = typeOf(b);
    headInner = `<span class="grip"></span>
      <span class="mlabel"><span class="g">${type?.glyph || ""}</span>${esc(type?.label || b.type)}</span>
      <button class="bhbtn bdel" title="Delete block" data-bdel>✕</button>`;
  }
  el.innerHTML = `<div class="bhead" data-grip>${headInner}</div><div class="bports" data-ports></div>`;
  world.appendChild(el); b._el = el; positionBlock(b); renderPorts(b);

  const head = el.querySelector("[data-grip]");
  head.addEventListener("pointerdown", (e) => { if (e.target.closest("input,button")) return; startBlockDrag(b, e); });
  el.addEventListener("pointerdown", () => { if (!session.route) select("block", b.id); }, true);
  el.querySelector("[data-bdel]").addEventListener("click", (e) => { e.stopPropagation(); removeBlock(b.id); });

  if (isInstance) {
    const mn = el.querySelector("[data-mname]");
    mn.addEventListener("input", (e) => renameModule(b.ref, e.target.value, e.target));
    mn.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.querySelector("[data-bopen]").addEventListener("click", (e) => { e.stopPropagation(); openTab(b.ref); });
    el.addEventListener("dblclick", (e) => { if (e.target.closest("input,button")) return; openTab(b.ref); });
  }
}

export function renderPorts(b) {
  const host = b._el.querySelector("[data-ports]");
  b.ports.forEach((p) => portDots.delete(p.id));
  const ins = b.ports.filter((p) => p.dir === "input"), outs = b.ports.filter((p) => p.dir === "output");
  host.innerHTML = `
    <div class="col ins">${ins.map(portRow).join("")}</div>
    <div class="col outs">${outs.map(portRow).join("")}</div>`;
  host.querySelectorAll(".port").forEach((row) => {
    const pid = row.dataset.pid, dot = row.querySelector(".dot");
    dot.dataset.pid = pid; portDots.set(pid, dot);
    dot.addEventListener("pointerdown", (e) => { if (e.button !== 0 || session.route) return; e.stopPropagation(); beginRoute(pid, e); });
  });
}
function portRow(p) {
  const w = parseInt(p.width, 10) || 1;
  const label = esc(p.name) + (w > 1 ? ` <span class="pw-tag">[${w - 1}:0]</span>` : "");
  if (p.dir === "input")
    return `<div class="port in" data-pid="${p.id}"><span class="dot in"></span><span class="pname pfix">${label}</span></div>`;
  return `<div class="port out" data-pid="${p.id}"><span class="pname pfix">${label}</span><span class="dot out"></span></div>`;
}

/* ---------------- interface ports panel (active sheet) ---------------- */
export function renderTPorts() {
  const mod = state.modules[state.activeId];
  const isTop = mod.isTop;
  const ti = $("#tpanel .ti");
  if (ti) ti.textContent = isTop ? "Top-level ports" : `Module ports · ${mod.name}`;
  const body = $("#tpbody");
  $("#tpCount").textContent = state.tports.length;
  if (!state.tports.length) {
    body.innerHTML = `<div class="tpempty">No ${isTop ? "top-level" : "module"} ports yet. Add one here, or right-click while routing a wire to attach a pin.</div>`;
    return;
  }
  body.innerHTML = state.tports.map((t) => `
    <div class="tprow" data-tp="${t.id}">
      <span class="cdot ${t.dir === "input" ? "in" : "out"}" title="Toggle direction" data-dir></span>
      <input class="tn" data-tn value="${esc(t.name)}" spellcheck="false">
      <input class="tw" data-tw value="${esc(String(t.width))}" title="bit width">
      <button class="trm" data-trm title="remove">✕</button>
    </div>`).join("");
  body.querySelectorAll(".tprow").forEach((row) => {
    const id = row.dataset.tp, t = tportById(id);
    row.querySelector("[data-dir]").addEventListener("click", () => { t.dir = t.dir === "input" ? "output" : "input"; renderTPorts(); reconcileInstances(state.activeId); updateWires(); refreshSV(); });
    row.querySelector("[data-tn]").addEventListener("input", (e) => { t.name = e.target.value; reconcileInstances(state.activeId); updateWires(); refreshSV(); });
    row.querySelector("[data-tw]").addEventListener("input", (e) => { t.width = e.target.value.replace(/\D/g, "") || "1"; reconcileInstances(state.activeId); updateWires(); refreshSV(); });
    row.querySelector("[data-trm]").addEventListener("click", () => removeTPort(id));
  });
}

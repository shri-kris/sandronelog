// Rendering: block DOM, ports, and the top-level ports panel.
// Branches on the block-type registry flags so primitives get a compact,
// fixed UI while `module` blocks keep the full editable one.

import { state, portDots, session } from "./state.js";
import { $, world, esc } from "./dom.js";
import { typeOf } from "./blockTypes.js";
import { addPort, removePort, removeBlock, select, tportById, removeTPort } from "./model.js";
import { updateWires } from "./wires.js";
import { refreshSV } from "./codegen.js";
import { beginRoute } from "./routing.js";
import { startBlockDrag } from "./interactions.js";

export function positionBlock(b) { b._el.style.left = b.x + "px"; b._el.style.top = b.y + "px"; }

export function renderBlock(b) {
  const type = typeOf(b);
  const el = document.createElement("div");
  el.className = "block" + (type.kind === "primitive" ? " primitive" : "");
  el.dataset.id = b.id;

  const nameHTML = type.editableName
    ? `<input class="mname" value="${esc(b.name)}" spellcheck="false" data-mname>`
    : `<span class="mlabel"><span class="g">${type.glyph || ""}</span>${esc(type.label)}</span>`;
  const bodyToggle = type.editableBody
    ? `<button class="bhbtn bbody-toggle ${b.bodyOpen ? "on" : ""}" title="Module body" data-bodytoggle>{ }</button>` : "";
  const bodyWrap = type.editableBody
    ? `<div class="bbody ${b.bodyOpen ? "" : "hidden"}" data-bodywrap>
         <div class="lbl">internal logic (free text)</div>
         <textarea class="bodyta" spellcheck="false" data-body placeholder="assign y = a & b;">${esc(b.body)}</textarea>
       </div>` : "";

  el.innerHTML = `
    <div class="bhead" data-grip>
      <span class="grip"></span>
      ${nameHTML}
      ${bodyToggle}
      <button class="bhbtn bdel" title="Delete block" data-bdel>✕</button>
    </div>
    <div class="bports" data-ports></div>
    ${bodyWrap}`;
  world.appendChild(el); b._el = el; positionBlock(b); renderPorts(b);

  const head = el.querySelector("[data-grip]");
  head.addEventListener("pointerdown", (e) => { if (e.target.closest("input,button")) return; startBlockDrag(b, e); });
  el.addEventListener("pointerdown", () => { if (!session.route) select("block", b.id); }, true);
  el.querySelector("[data-bdel]").addEventListener("click", (e) => { e.stopPropagation(); removeBlock(b.id); });

  if (type.editableName) {
    const mn = el.querySelector("[data-mname]");
    mn.addEventListener("input", (e) => { b.name = e.target.value; refreshSV(); });
    mn.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  if (type.editableBody) {
    el.querySelector("[data-bodytoggle]").addEventListener("click", (e) => {
      e.stopPropagation(); b.bodyOpen = !b.bodyOpen;
      el.querySelector("[data-bodywrap]").classList.toggle("hidden", !b.bodyOpen);
      e.currentTarget.classList.toggle("on", b.bodyOpen); updateWires();
    });
    el.querySelector("[data-body]").addEventListener("input", (e) => { b.body = e.target.value; refreshSV(); });
  }
}

export function renderPorts(b) {
  const editable = typeOf(b).editablePorts;
  const host = b._el.querySelector("[data-ports]");
  b.ports.forEach((p) => portDots.delete(p.id));
  const ins = b.ports.filter((p) => p.dir === "input"), outs = b.ports.filter((p) => p.dir === "output");
  const addBtn = (dir) => (editable ? `<button class="addp" data-add="${dir}">+ ${dir}</button>` : "");
  host.innerHTML = `
    <div class="col ins">${ins.map((p) => portRow(p, editable)).join("")}${addBtn("input")}</div>
    <div class="col outs">${outs.map((p) => portRow(p, editable)).join("")}${addBtn("output")}</div>`;

  host.querySelectorAll(".port").forEach((row) => {
    const pid = row.dataset.pid, p = b.ports.find((x) => x.id === pid), dot = row.querySelector(".dot");
    dot.dataset.pid = pid; portDots.set(pid, dot);
    dot.addEventListener("pointerdown", (e) => { if (e.button !== 0 || session.route) return; e.stopPropagation(); beginRoute(pid, e); });
    if (editable) {
      row.querySelector("[data-pname]")?.addEventListener("input", (e) => { p.name = e.target.value; refreshSV(); });
      row.querySelector("[data-pw]")?.addEventListener("input", (e) => { p.width = e.target.value.replace(/\D/g, "") || "1"; refreshSV(); updateWires(); });
      row.querySelector("[data-prm]")?.addEventListener("click", (e) => { e.stopPropagation(); removePort(b, pid); });
      row.querySelectorAll("input").forEach((i) => i.addEventListener("pointerdown", (e) => e.stopPropagation()));
    }
  });
  if (editable) host.querySelectorAll(".addp").forEach((btn) => btn.addEventListener("click", (e) => { e.stopPropagation(); addPort(b, btn.dataset.add); }));
}

function portRow(p, editable) {
  const pw = editable ? `<input class="pw" data-pw value="${esc(String(p.width))}" title="bit width">` : "";
  const prm = editable ? `<button class="prm" data-prm title="remove">✕</button>` : "";
  const nameEl = editable
    ? `<input class="pname" data-pname value="${esc(p.name)}" spellcheck="false">`
    : `<span class="pname pfix">${esc(p.name)}</span>`;
  if (p.dir === "input")
    return `<div class="port in" data-pid="${p.id}"><span class="dot in"></span>${nameEl}${pw}${prm}</div>`;
  return `<div class="port out" data-pid="${p.id}">${prm}${pw}${nameEl}<span class="dot out"></span></div>`;
}

/* ---------------- top-level ports panel ---------------- */
export function renderTPorts() {
  const body = $("#tpbody");
  $("#tpCount").textContent = state.tports.length;
  if (!state.tports.length) {
    body.innerHTML = `<div class="tpempty">No top-level ports yet. Add one here, or right-click while routing a wire to attach a pin.</div>`;
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
    row.querySelector("[data-dir]").addEventListener("click", () => { t.dir = t.dir === "input" ? "output" : "input"; renderTPorts(); updateWires(); refreshSV(); });
    row.querySelector("[data-tn]").addEventListener("input", (e) => { t.name = e.target.value; updateWires(); refreshSV(); });
    row.querySelector("[data-tw]").addEventListener("input", (e) => { t.width = e.target.value.replace(/\D/g, "") || "1"; updateWires(); refreshSV(); });
    row.querySelector("[data-trm]").addEventListener("click", () => removeTPort(id));
  });
}

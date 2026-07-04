// Canvas interactions: block dragging, panning, zooming, and keyboard.

import { state, session } from "./state.js";
import { $, canvas, world, clamp } from "./dom.js";
import { positionBlock } from "./render.js";
import { updateWires } from "./wires.js";
import { clearSelect, removeBlock, removeWire } from "./model.js";
import { cancelRoute, closeMenu } from "./routing.js";

/* ---- block move / pan ---- */
export function startBlockDrag(b, e) {
  e.preventDefault();
  session.drag = { kind: "block", b, ox: b.x, oy: b.y, sx: e.clientX, sy: e.clientY };
  window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true });
}
function startPan(e) {
  canvas.classList.add("panning");
  session.drag = { kind: "pan", ox: state.view.x, oy: state.view.y, sx: e.clientX, sy: e.clientY };
  window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true });
}
function onMove(e) {
  const drag = session.drag; if (!drag) return;
  if (drag.kind === "block") {
    const s = state.view.scale;
    drag.b.x = drag.ox + (e.clientX - drag.sx) / s; drag.b.y = drag.oy + (e.clientY - drag.sy) / s;
    positionBlock(drag.b); updateWires();
  } else if (drag.kind === "pan") {
    state.view.x = drag.ox + (e.clientX - drag.sx); state.view.y = drag.oy + (e.clientY - drag.sy); applyView();
  }
}
function onUp() { canvas.classList.remove("panning"); session.drag = null; window.removeEventListener("pointermove", onMove); }

canvas.addEventListener("pointerdown", (e) => {
  if (session.route) return;
  if (e.target === canvas || e.target === world || e.target.id === "wires") { clearSelect(); startPan(e); }
});

/* ---- zoom ---- */
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect(), cx = e.clientX - rect.left, cy = e.clientY - rect.top, old = state.view.scale;
  const ns = clamp(old * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.25, 2.5);
  const wx = (cx - state.view.x) / old, wy = (cy - state.view.y) / old;
  state.view.scale = ns; state.view.x = cx - wx * ns; state.view.y = cy - wy * ns; applyView();
}, { passive: false });

export function applyView() {
  const v = state.view;
  world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.scale})`;
  $("#zoomLbl").textContent = Math.round(v.scale * 100) + "%";
}
export function zoomBy(f) {
  const rect = canvas.getBoundingClientRect(), cx = rect.width / 2, cy = rect.height / 2, old = state.view.scale;
  const ns = clamp(old * f, 0.25, 2.5), wx = (cx - state.view.x) / old, wy = (cy - state.view.y) / old;
  state.view.scale = ns; state.view.x = cx - wx * ns; state.view.y = cy - wy * ns; applyView();
}

/* ---- keyboard ---- */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (session.route) { cancelRoute(); return; } closeMenu(); return; }
  if ((e.key === "Delete" || e.key === "Backspace") && state.selected) {
    const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
    e.preventDefault();
    if (state.selected.type === "block") removeBlock(state.selected.id); else removeWire(state.selected.id);
  }
});

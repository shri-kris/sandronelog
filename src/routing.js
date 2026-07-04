// Wire routing (drag, or click + sticky) and the "attach to top-level port"
// context menu shown on right-click while routing.

import { session, portDots } from "./state.js";
import { canvas, esc } from "./dom.js";
import { state } from "./state.js";
import { dotWorldPoint, screenToWorld, tracePath, updateWires } from "./wires.js";
import { addWire, portById, tagPort, createTPortFrom } from "./model.js";

export function beginRoute(fromPid, e) {
  e.preventDefault();
  session.route = { from: fromPid, sticky: false };
  canvas.classList.add("linking"); portDots.get(fromPid)?.classList.add("armed");
  window.addEventListener("pointermove", routeMove);
  window.addEventListener("pointerup", routeUpInitial, { once: true });
}
function routeMove(e) {
  if (!session.route) return;
  const a = dotWorldPoint(portDots.get(session.route.from)), m = screenToWorld(e.clientX, e.clientY);
  session.tempPath = tracePath(a.x, a.y, m.x, m.y);
  document.querySelectorAll(".dot.armed").forEach((d) => { if (d.dataset.pid !== session.route.from) d.classList.remove("armed"); });
  const t = e.target.closest?.(".dot");
  if (t && t.dataset.pid !== session.route.from) t.classList.add("armed");
  updateWires();
}
function dotPidUnder(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const d = el && el.closest && el.closest(".dot");
  return d ? d.dataset.pid : null;
}
function routeUpInitial(e) {
  if (!session.route) return;
  if (e.button === 0) {
    const pid = dotPidUnder(e);
    if (pid && pid !== session.route.from) { finishRoute(pid); return; }
  }
  enterSticky();
}
function enterSticky() {
  if (session.route && !session.route.sticky) { session.route.sticky = true; window.addEventListener("pointerdown", routeClick, true); }
}
function routeClick(e) {
  if (!session.route) return;
  if (e.target.closest && e.target.closest("#ctxmenu")) return;   // let the menu handle its own clicks
  if (e.button !== 0) return;                                     // right-click handled by contextmenu
  e.stopPropagation();
  const pid = dotPidUnder(e);
  if (pid && pid !== session.route.from) { e.preventDefault(); finishRoute(pid); }
  else cancelRoute();
}
function finishRoute(pid) { const from = session.route.from; cancelRoute(); addWire(from, pid); }
export function cancelRoute() {
  closeMenu();
  window.removeEventListener("pointermove", routeMove);
  window.removeEventListener("pointerdown", routeClick, true);
  document.querySelectorAll(".dot.armed").forEach((d) => d.classList.remove("armed"));
  canvas.classList.remove("linking"); session.tempPath = null; session.route = null; updateWires();
}
window.addEventListener("contextmenu", (e) => {
  if (session.route) { e.preventDefault(); enterSticky(); openTopPortMenu(e.clientX, e.clientY, session.route.from); }
});

/* ---- context menu for attaching to a top-level port ---- */
export function closeMenu() { document.getElementById("ctxmenu")?.remove(); }
function openTopPortMenu(cx, cy, blockPid) {
  closeMenu();
  const pinfo = portById(blockPid); if (!pinfo) return;
  const menu = document.createElement("div"); menu.className = "ctxmenu"; menu.id = "ctxmenu";
  let html = `<div class="ctxh">Attach <b>${esc(pinfo.port.name)}</b> to a top-level port</div>`;
  if (state.tports.length) {
    html += state.tports.map((t) => {
      const w = parseInt(t.width, 10) || 1;
      return `<button class="ctxi" data-t="${t.id}"><span class="cdot ${t.dir === "input" ? "in" : "out"}"></span>${esc(t.name)}<span class="cw">${w > 1 ? `[${w - 1}:0]` : "1-bit"}</span></button>`;
    }).join("");
    html += `<div class="ctxsep"></div>`;
  } else {
    html += `<div class="ctxempty">No top-level ports yet — create one:</div>`;
  }
  html += `<button class="ctxi new" data-new="input"><span class="cdot in"></span>New input port</button>
           <button class="ctxi new" data-new="output"><span class="cdot out"></span>New output port</button>`;
  menu.innerHTML = html;
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(cx, window.innerWidth - r.width - 8) + "px";
  menu.style.top = Math.min(cy, window.innerHeight - r.height - 8) + "px";
  menu.querySelectorAll("[data-t]").forEach((btn) => btn.addEventListener("click", () => { tagPort(blockPid, btn.dataset.t); cancelRoute(); }));
  menu.querySelectorAll("[data-new]").forEach((btn) => btn.addEventListener("click", () => { const t = createTPortFrom(pinfo.port, btn.dataset.new); tagPort(blockPid, t.id); cancelRoute(); }));
}

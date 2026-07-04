// Wire geometry and rendering: traces, top-port flags, width labels.

import { state, portDots, session } from "./state.js";
import { world, svg, cssVar, esc } from "./dom.js";
import { portById, tportById, select } from "./model.js";

export function dotWorldPoint(dot) {
  const wr = world.getBoundingClientRect(), s = state.view.scale, r = dot.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - wr.left) / s, y: (r.top + r.height / 2 - wr.top) / s };
}
export function screenToWorld(cx, cy) {
  const wr = world.getBoundingClientRect(), s = state.view.scale;
  return { x: (cx - wr.left) / s, y: (cy - wr.top) / s };
}
export function tracePath(x1, y1, x2, y2) {
  const dx = Math.max(46, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
function wireWidth(w) {
  const a = portById(w.from), b = portById(w.to);
  return Math.max(a ? parseInt(a.port.width, 10) || 1 : 1, b ? parseInt(b.port.width, 10) || 1 : 1);
}
function flagSVG(dot, tport, blockDir, wireId) {
  const pt = dotWorldPoint(dot);
  const w = parseInt(tport.width, 10) || 1;
  const label = esc(tport.name || "net") + (w > 1 ? ` [${w - 1}:0]` : "");
  const tw = label.length * 6.6 + 16, h = 18, gap = 11, left = blockDir === "input";
  const rx = left ? pt.x - gap - tw : pt.x + gap, ry = pt.y - h / 2;
  const stubX = left ? pt.x - gap : pt.x + gap;
  const col = tport.dir === "input" ? "var(--sig-in)" : "var(--sig-out)";
  const sel = state.selected?.type === "wire" && state.selected.id === wireId;
  return `<g class="flag" data-wid="${wireId}">
    <line x1="${pt.x}" y1="${pt.y}" x2="${stubX}" y2="${pt.y}" stroke="${col}" stroke-width="2"/>
    <rect x="${rx}" y="${ry}" width="${tw}" height="${h}" rx="4" fill="var(--panel)" stroke="${col}" stroke-width="${sel ? 2 : 1.3}"/>
    <text x="${rx + tw / 2}" y="${pt.y + 0.5}" fill="var(--ink)" font-family="var(--mono)" font-size="11" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </g>`;
}
function widthLabelSVG(mx, my, n) {
  const t = String(n), w = t.length * 7 + 13, h = 16;
  return `<g class="wlabel"><rect x="${mx - w / 2}" y="${my - h / 2}" width="${w}" height="${h}" rx="8" fill="var(--panel)" stroke="var(--trace)" stroke-width="1.2"/>
    <text x="${mx}" y="${my + 0.5}" fill="var(--trace-hi)" font-family="var(--mono)" font-size="10.5" text-anchor="middle" dominant-baseline="middle">${t}</text></g>`;
}

export function updateWires() {
  const TP = new Set(state.tports.map((t) => t.id));
  let html = `<defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="0" stdDeviation="2.4" flood-color="${cssVar("--glow") || "#c9893f"}" flood-opacity="${cssVar("--glow-op") || ".4"}"/></filter></defs>`;
  for (const w of state.wires) {
    if (w.tag || TP.has(w.to) || TP.has(w.from)) {
      const blockPid = TP.has(w.to) ? w.from : w.to;
      const t = tportById(TP.has(w.to) ? w.to : w.from);
      const pinfo = portById(blockPid), dot = portDots.get(blockPid);
      if (!dot || !t || !pinfo) continue;
      html += flagSVG(dot, t, pinfo.port.dir, w.id);
    } else {
      const da = portDots.get(w.from), db = portDots.get(w.to);
      if (!da || !db) continue;
      const a = dotWorldPoint(da), b = dotWorldPoint(db);
      const sel = state.selected?.type === "wire" && state.selected.id === w.id;
      html += `<path class="trace" data-wid="${w.id}" d="${tracePath(a.x, a.y, b.x, b.y)}" fill="none" stroke="${sel ? "var(--trace-hi)" : "var(--trace)"}" stroke-width="${sel ? 3.4 : 2.4}" stroke-linecap="round" filter="url(#glow)"/>`;
      const wd = wireWidth(w);
      if (wd > 1) html += widthLabelSVG((a.x + b.x) / 2, (a.y + b.y) / 2, wd);
    }
  }
  if (session.tempPath) html += `<path d="${session.tempPath}" fill="none" stroke="var(--sel)" stroke-width="2.4" stroke-dasharray="6 5" stroke-linecap="round" opacity="0.9"/>`;
  svg.innerHTML = html;
  svg.querySelectorAll("path.trace").forEach((p) => p.addEventListener("pointerdown", (e) => { if (session.route) return; e.stopPropagation(); select("wire", p.dataset.wid); }));
  svg.querySelectorAll("g.flag").forEach((gr) => gr.addEventListener("pointerdown", (e) => { if (session.route) return; e.stopPropagation(); select("wire", gr.dataset.wid); }));
}

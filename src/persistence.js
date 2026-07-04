// Save / load designs as JSON. Blocks carry a `type` (v3); files without it
// (older v2 saves) default to the generic "module" so they still open.

import { state, uid, portDots } from "./state.js";
import { makeTPort } from "./model.js";
import { renderBlock, renderTPorts } from "./render.js";
import { updateWires } from "./wires.js";
import { refreshSV } from "./codegen.js";
import { applyView } from "./interactions.js";

export function serialize() {
  return JSON.stringify({
    version: 3, view: state.view,
    tports: state.tports.map((t) => ({ id: t.id, name: t.name, dir: t.dir, width: t.width })),
    blocks: state.blocks.map((b) => ({
      type: b.type || "module", name: b.name, x: b.x, y: b.y, body: b.body, bodyOpen: b.bodyOpen,
      ports: b.ports.map((p) => ({ id: p.id, name: p.name, dir: p.dir, width: p.width })),
    })),
    wires: state.wires.map((w) => ({ from: w.from, to: w.to, tag: !!w.tag })),
  }, null, 2);
}

export function loadDesign(data) {
  state.blocks.forEach((b) => b._el?.remove());
  state.blocks = []; state.wires = []; state.tports = []; portDots.clear(); state.selected = null;
  const idMap = {};
  (data.tports || []).forEach((td) => { const t = makeTPort(td.name, td.dir, td.width ?? 1); if (td.id) idMap[td.id] = t.id; });
  (data.blocks || []).forEach((bd) => {
    const b = { id: uid("b"), type: bd.type || "module", name: bd.name, x: bd.x, y: bd.y, body: bd.body || "", bodyOpen: !!bd.bodyOpen, ports: [] };
    (bd.ports || []).forEach((p) => { const np = { id: uid("p"), name: p.name, dir: p.dir, width: p.width ?? 1 }; if (p.id) idMap[p.id] = np.id; b.ports.push(np); });
    state.blocks.push(b); renderBlock(b);
  });
  (data.wires || []).forEach((w) => { const f = idMap[w.from], t = idMap[w.to]; if (f && t) state.wires.push({ id: uid("w"), from: f, to: t, tag: !!w.tag }); });
  if (data.view) state.view = data.view;
  renderTPorts(); applyView(); updateWires(); refreshSV();
}

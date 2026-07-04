// Save / load. Schema v4 stores the whole module hierarchy. v3 (flat) files are
// migrated: the old design becomes `top`, and each old editable module block
// becomes a definition + an instance (its free-text body is dropped).

import { state, uid, VERSION } from "./state.js";
import { renderSheet, createTop } from "./sheets.js";

export function serialize() {
  return JSON.stringify({
    version: 4, appVersion: VERSION,
    activeId: state.activeId, openTabs: state.openTabs, order: state.order,
    modules: Object.values(state.modules).map((m) => ({
      id: m.id, name: m.name, isTop: !!m.isTop, view: m.view,
      tports: m.tports.map((t) => ({ id: t.id, name: t.name, dir: t.dir, width: t.width })),
      blocks: m.blocks.map((b) => b.kind === "instance"
        ? { kind: "instance", ref: b.ref, x: b.x, y: b.y, ports: b.ports.map((p) => ({ id: p.id, tref: p.tref, name: p.name, dir: p.dir, width: p.width })) }
        : { kind: "primitive", type: b.type, x: b.x, y: b.y, ports: b.ports.map((p) => ({ id: p.id, name: p.name, dir: p.dir, width: p.width })) }),
      wires: m.wires.map((w) => ({ from: w.from, to: w.to, tag: !!w.tag })),
    })),
  }, null, 2);
}

function migrateV3(data) {
  const top = {
    id: "top", name: "top", isTop: true, view: data.view || { x: 60, y: 60, scale: 1 },
    tports: (data.tports || []).map((t) => ({ id: t.id, name: t.name, dir: t.dir, width: t.width ?? 1 })),
    blocks: [], wires: (data.wires || []).map((w) => ({ from: w.from, to: w.to, tag: !!w.tag })),
  };
  const modules = [];
  (data.blocks || []).forEach((b) => {
    if (b.type === "module") {
      const defId = uid("m"), tref = {};
      const def = { id: defId, name: b.name || "module", isTop: false, view: { x: 60, y: 60, scale: 1 }, tports: [], blocks: [], wires: [] };
      (b.ports || []).forEach((p) => { const tid = uid("t"); tref[p.id] = tid; def.tports.push({ id: tid, name: p.name, dir: p.dir, width: p.width ?? 1 }); });
      modules.push(def);
      top.blocks.push({ kind: "instance", ref: defId, x: b.x, y: b.y, ports: (b.ports || []).map((p) => ({ id: p.id, tref: tref[p.id], name: p.name, dir: p.dir, width: p.width ?? 1 })) });
    } else {
      top.blocks.push({ kind: "primitive", type: b.type, x: b.x, y: b.y, ports: (b.ports || []).map((p) => ({ id: p.id, name: p.name, dir: p.dir, width: p.width ?? 1 })) });
    }
  });
  modules.push(top);
  return { version: 4, activeId: "top", openTabs: ["top"], modules };
}

export function loadDesign(raw) {
  const data = (raw.version >= 4) ? raw : migrateV3(raw);
  state.modules = {}; state.order = []; state.openTabs = []; state.activeId = "top"; state.selected = null;

  const idMap = {};
  const mid = (id) => id === "top" ? "top" : (idMap[id] ||= uid("m"));   // module ids
  const rid = (id) => id == null ? null : (idMap[id] ||= uid("x"));       // port / tport ids

  (data.modules || []).forEach((m) => mid(m.id));   // pre-map so refs resolve
  (data.modules || []).forEach((m) => {
    const nm = { id: mid(m.id), name: m.name, isTop: !!m.isTop, view: m.view || { x: 60, y: 60, scale: 1 }, tports: [], blocks: [], wires: [] };
    (m.tports || []).forEach((t) => nm.tports.push({ id: rid(t.id), name: t.name, dir: t.dir, width: t.width ?? 1 }));
    (m.blocks || []).forEach((b) => {
      if (b.kind === "instance") {
        nm.blocks.push({ id: uid("b"), kind: "instance", ref: mid(b.ref), x: b.x, y: b.y, ports: (b.ports || []).map((p) => ({ id: rid(p.id), tref: rid(p.tref), name: p.name, dir: p.dir, width: p.width ?? 1 })) });
      } else {
        nm.blocks.push({ id: uid("b"), kind: "primitive", type: b.type, x: b.x, y: b.y, ports: (b.ports || []).map((p) => ({ id: rid(p.id), name: p.name, dir: p.dir, width: p.width ?? 1 })) });
      }
    });
    (m.wires || []).forEach((w) => nm.wires.push({ id: uid("w"), from: rid(w.from), to: rid(w.to), tag: !!w.tag }));
    state.modules[nm.id] = nm;
    if (!nm.isTop) state.order.push(nm.id);
  });
  if (!state.modules.top) createTop();

  const wantActive = data.activeId ? mid(data.activeId) : "top";
  state.activeId = state.modules[wantActive] ? wantActive : "top";
  state.openTabs = (data.openTabs || ["top"]).map(mid).filter((id) => state.modules[id]);
  if (!state.openTabs.includes("top")) state.openTabs.unshift("top");
  renderSheet(state.activeId);
}

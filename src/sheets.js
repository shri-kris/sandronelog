// Module hierarchy engine: definitions, instances, tabs, and the per-sheet
// render/reconcile logic that ties them together.

import { state, uid, portDots } from "./state.js";
import { $, world, esc, sanitize, toast } from "./dom.js";
import { select } from "./model.js";
import { renderBlock, renderPorts, renderTPorts } from "./render.js";
import { updateWires } from "./wires.js";
import { refreshSV } from "./codegen.js";
import { applyView } from "./interactions.js";
import { renderPaletteItems } from "./palette.js";

/* ---------------- module definitions ---------------- */
export function createTop() {
  const mod = { id: "top", name: "top", isTop: true, blocks: [], wires: [], tports: [], view: { x: 60, y: 60, scale: 1 } };
  state.modules.top = mod; state.activeId = "top"; state.openTabs = ["top"];
  return mod;
}
function uniqueModuleName(base) {
  let name = base, k = 1;
  const taken = () => Object.values(state.modules).some((m) => sanitize(m.name) === sanitize(name));
  while (taken()) name = `${base}_${k++}`;
  return name;
}
export function createModule(opts = {}) {
  const id = uid("m");
  const tsrc = opts.tports || [{ name: "a", dir: "input", width: 1 }, { name: "y", dir: "output", width: 1 }];
  const mod = {
    id, name: opts.name ? uniqueModuleName(opts.name) : uniqueModuleName("module"),
    isTop: false, blocks: [], wires: [], view: { x: 60, y: 60, scale: 1 },
    tports: tsrc.map((t) => ({ id: uid("t"), name: t.name, dir: t.dir, width: t.width ?? 1 })),
  };
  state.modules[id] = mod; state.order.push(id);
  return mod;
}

/* ---------------- instances ---------------- */
// Build an instance's pins from a definition's interface ports, preserving pin
// ids (keyed by tref) so wires survive when the interface changes.
export function instancePorts(def, existing = []) {
  const byTref = new Map(existing.map((p) => [p.tref, p]));
  return def.tports.map((t) => {
    const ex = byTref.get(t.id);
    return { id: ex?.id || uid("p"), tref: t.id, name: t.name, dir: t.dir, width: t.width };
  });
}
export function addInstance(ref, opts = {}) {
  const def = state.modules[ref]; if (!def) return null;
  const b = { id: uid("b"), kind: "instance", ref, x: opts.x ?? 120, y: opts.y ?? 120, ports: instancePorts(def) };
  state.blocks.push(b); renderBlock(b); updateWires(); refreshSV();
  if (!opts.quiet) select("block", b.id);
  return b;
}

// After a definition's interface ports change, sync every instance of it.
export function reconcileInstances(defId) {
  const def = state.modules[defId]; if (!def) return;
  const keep = new Set(def.tports.map((t) => t.id));
  for (const mid in state.modules) {
    const mod = state.modules[mid];
    for (const b of mod.blocks) {
      if (b.kind !== "instance" || b.ref !== defId) continue;
      const removed = new Set(b.ports.filter((p) => !keep.has(p.tref)).map((p) => p.id));
      if (removed.size) mod.wires = mod.wires.filter((w) => !removed.has(w.from) && !removed.has(w.to));
      b.ports = instancePorts(def, b.ports);
      if (mid === state.activeId && b._el) renderPorts(b);   // live-update visible pins
    }
  }
  updateWires(); refreshSV();
}

export function renameModule(defId, name, sourceEl) {
  const def = state.modules[defId]; if (!def) return;
  def.name = name;
  for (const mid in state.modules) for (const b of state.modules[mid].blocks) {
    if (b.kind === "instance" && b.ref === defId && b._el) {
      const inp = b._el.querySelector("[data-mname]");
      if (inp && inp !== sourceEl) inp.value = name;
    }
  }
  renderTabs(); renderPaletteItems(); refreshSV();
}

export function deleteModule(defId) {
  const def = state.modules[defId]; if (!def || def.isTop) return;
  for (const mid in state.modules) {
    const mod = state.modules[mid];
    const instIds = new Set(mod.blocks.filter((b) => b.kind === "instance" && b.ref === defId).map((b) => b.id));
    if (!instIds.size) continue;
    const pinIds = new Set();
    mod.blocks.forEach((b) => { if (instIds.has(b.id)) b.ports.forEach((p) => pinIds.add(p.id)); });
    mod.wires = mod.wires.filter((w) => !pinIds.has(w.from) && !pinIds.has(w.to));
    mod.blocks = mod.blocks.filter((b) => !instIds.has(b.id));
  }
  delete state.modules[defId];
  state.order = state.order.filter((x) => x !== defId);
  state.openTabs = state.openTabs.filter((x) => x !== defId);
  renderSheet(state.activeId === defId ? "top" : state.activeId);
}

// Would instantiating `defId` inside `hostId` create a cycle?
export function wouldCreateCycle(hostId, defId) {
  if (hostId === defId) return true;
  const seen = new Set(), stack = [defId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === hostId) return true;
    if (seen.has(cur)) continue; seen.add(cur);
    const mod = state.modules[cur]; if (!mod) continue;
    for (const b of mod.blocks) if (b.kind === "instance") stack.push(b.ref);
  }
  return false;
}

/* ---------------- tabs + sheet rendering ---------------- */
export function openTab(id) { activateSheet(id); }
export function closeTab(id) {
  if (id === "top") return;
  state.openTabs = state.openTabs.filter((x) => x !== id);
  if (state.activeId === id) activateSheet("top");
  else renderTabs();
}
export function activateSheet(id) {
  if (!state.modules[id]) return;
  if (!state.openTabs.includes(id)) state.openTabs.push(id);
  renderSheet(id);
}
export function renderSheet(id) {
  const prev = state.modules[state.activeId];
  if (prev) prev.blocks.forEach((b) => { b._el = null; });
  world.querySelectorAll(".block").forEach((el) => el.remove());
  portDots.clear();
  state.selected = null;
  state.activeId = id;
  state.modules[id].blocks.forEach((b) => renderBlock(b));
  renderTPorts(); applyView(); updateWires(); refreshSV();
  renderTabs(); renderPaletteItems();
}
export function renderTabs() {
  const bar = $("#tabbar");
  bar.innerHTML = state.openTabs.map((id) => {
    const mod = state.modules[id]; if (!mod) return "";
    const active = id === state.activeId ? " active" : "";
    const close = id === "top" ? "" : `<button class="tclose" data-tclose="${id}" title="Close tab">✕</button>`;
    const dot = mod.isTop ? "★" : "▤";
    return `<div class="tab${active}" data-tab="${id}"><span class="tdot">${dot}</span><span class="tname">${esc(mod.name)}</span>${close}</div>`;
  }).join("");
  bar.querySelectorAll(".tab").forEach((el) =>
    el.addEventListener("click", (e) => { if (e.target.closest("[data-tclose]")) return; activateSheet(el.dataset.tab); }));
  bar.querySelectorAll("[data-tclose]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); closeTab(btn.dataset.tclose); }));
}

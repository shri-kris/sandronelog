// Model mutations: blocks, ports, wires, top-level ports, selection.
// These mutate `state` and then trigger re-render / re-generation.

import { state, uid, portDots } from "./state.js";
import { sanitize } from "./dom.js";
import { typeOf, blockTypes } from "./blockTypes.js";
import { renderBlock, renderPorts, renderTPorts } from "./render.js";
import { updateWires } from "./wires.js";
import { refreshSV } from "./codegen.js";

/* ---------------- blocks / ports ---------------- */
export function addBlock(opts = {}) {
  const type = blockTypes[opts.type] ? opts.type : "module";
  const def = blockTypes[type];
  const portSrc = opts.ports || def.ports;
  const b = {
    id: uid("b"), type,
    name: opts.name || (def.kind === "module" ? `module_${state.blocks.length + 1}` : def.label),
    x: opts.x ?? 120, y: opts.y ?? 120, body: opts.body || "",
    ports: portSrc.map((p) => ({ id: uid("p"), name: p.name, dir: p.dir, width: p.width ?? 1 })),
    bodyOpen: !!opts.bodyOpen,
  };
  state.blocks.push(b); renderBlock(b); updateWires(); refreshSV();
  if (!opts.quiet) select("block", b.id);
  return b;
}
export function removeBlock(id) {
  const b = state.blocks.find((x) => x.id === id); if (!b) return;
  const pids = new Set(b.ports.map((p) => p.id));
  state.wires = state.wires.filter((w) => !pids.has(w.from) && !pids.has(w.to));
  b.ports.forEach((p) => portDots.delete(p.id));
  b._el?.remove();
  state.blocks = state.blocks.filter((x) => x.id !== id);
  if (state.selected?.id === id) state.selected = null;
  updateWires(); refreshSV();
}
export function addPort(block, dir) {
  const n = block.ports.filter((p) => p.dir === dir).length;
  block.ports.push({ id: uid("p"), name: `${dir === "input" ? "in" : "out"}${n}`, dir, width: 1 });
  renderPorts(block); updateWires(); refreshSV();
}
export function removePort(block, pid) {
  block.ports = block.ports.filter((p) => p.id !== pid);
  state.wires = state.wires.filter((w) => w.from !== pid && w.to !== pid);
  portDots.delete(pid);
  renderPorts(block); updateWires(); refreshSV();
}
export function portById(pid) {
  for (const b of state.blocks) for (const p of b.ports) if (p.id === pid) return { block: b, port: p };
  return null;
}

/* ---------------- wires ---------------- */
export function addWire(a, b) {
  if (a === b) return;
  const pa = portById(a), pb = portById(b); if (!pa || !pb) return;
  let from = a, to = b;
  if (pb.port.dir === "output" && pa.port.dir !== "output") { from = b; to = a; }
  if (state.wires.some((w) => !w.tag && ((w.from === from && w.to === to) || (w.from === to && w.to === from)))) return;
  state.wires.push({ id: uid("w"), from, to });
  updateWires(); refreshSV();
}
export function removeWire(id) {
  state.wires = state.wires.filter((w) => w.id !== id);
  if (state.selected?.type === "wire" && state.selected.id === id) state.selected = null;
  updateWires(); refreshSV();
}

/* ---------------- top-level ports ---------------- */
export function tportById(id) { return state.tports.find((t) => t.id === id); }
export function makeTPort(name, dir, width) {
  const t = { id: uid("t"), name, dir, width: width ?? 1 };
  state.tports.push(t); return t;
}
export function addTPort(dir) {
  const n = state.tports.filter((t) => t.dir === dir).length;
  makeTPort(`${dir === "input" ? "in" : "out"}${n}`, dir, 1);
  renderTPorts(); refreshSV();
}
export function removeTPort(id) {
  state.tports = state.tports.filter((t) => t.id !== id);
  state.wires = state.wires.filter((w) => w.from !== id && w.to !== id);
  renderTPorts(); updateWires(); refreshSV();
}
export function tagPort(blockPid, tportId) {   // attach a block port to a top-level net (label, no wire)
  state.wires = state.wires.filter((w) => !(w.tag && w.from === blockPid));  // one tag per pin
  state.wires.push({ id: uid("w"), from: blockPid, to: tportId, tag: true });
  updateWires(); refreshSV();
}
export function createTPortFrom(srcPort, dir) {
  let base = sanitize(srcPort.name) || (dir === "input" ? "in" : "out");
  let name = base, k = 1;
  while (state.tports.some((t) => sanitize(t.name) === name)) name = `${base}_${k++}`;
  const t = makeTPort(name, dir, srcPort.width ?? 1);
  renderTPorts();
  return t;
}

/* ---------------- selection ---------------- */
export function select(type, id) {
  state.selected = { type, id };
  document.querySelectorAll(".block.sel").forEach((e) => e.classList.remove("sel"));
  if (type === "block") state.blocks.find((b) => b.id === id)?._el.classList.add("sel");
  updateWires();
}
export function clearSelect() {
  state.selected = null;
  document.querySelectorAll(".block.sel").forEach((e) => e.classList.remove("sel"));
  updateWires();
}

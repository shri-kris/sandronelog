// SystemVerilog generation. Every module definition emits its own
// `module … endmodule`; primitives become assign/always_ff statements and
// module instances become instantiations, all inside their parent module.

import { state, VERSION } from "./state.js";
import { $, esc, sanitize } from "./dom.js";
import { typeOf, blockTypes } from "./blockTypes.js";

function widthRange(w) { w = parseInt(w, 10); return (!w || w <= 1) ? "" : `[${w - 1}:0]`; }

const ownerName = (b) => b.kind === "instance"
  ? (state.modules[b.ref]?.name || "u")
  : (blockTypes[b.type]?.label || b.type);

// Union-find over one module's pins + interface ports -> named nets.
function buildNets(mod) {
  const parent = {};
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const info = {};
  for (const b of mod.blocks) for (const p of b.ports) { parent[p.id] = p.id; info[p.id] = { kind: "port", b, p }; }
  for (const t of mod.tports) { parent[t.id] = t.id; info[t.id] = { kind: "tport", t }; }
  for (const w of mod.wires) if (parent[w.from] !== undefined && parent[w.to] !== undefined) union(w.from, w.to);

  const groups = {};
  for (const id in parent) (groups[find(id)] ||= []).push(id);

  const netOf = {}, nets = []; let auto = 0;
  const used = new Set();
  const widthOf = (id) => info[id].kind === "tport" ? (parseInt(info[id].t.width, 10) || 1) : (parseInt(info[id].p.width, 10) || 1);

  for (const root in groups) {
    const mem = groups[root];
    const tportMem = mem.filter((id) => info[id].kind === "tport");
    const portMem = mem.filter((id) => info[id].kind === "port");
    if (tportMem.length) {
      const t = info[tportMem[0]].t;
      let base = sanitize(t.name) || "sig", name = base, k = 1;
      while (used.has(name)) name = `${base}_${k++}`; used.add(name);
      const width = Math.max(...mem.map(widthOf));
      nets.push({ name, width, top: true, dir: t.dir, tportId: t.id });
      portMem.forEach((id) => (netOf[id] = name));
    } else if (portMem.length >= 2) {
      const drv = portMem.find((id) => info[id].p.dir === "output");
      let base = drv ? `${sanitize(ownerName(info[drv].b)) || "m"}_${sanitize(info[drv].p.name) || "o"}` : `net_${auto++}`;
      let name = base, k = 1;
      while (used.has(name)) name = `${base}_${k++}`; used.add(name);
      const width = Math.max(...portMem.map(widthOf));
      nets.push({ name, width, top: false });
      portMem.forEach((id) => (netOf[id] = name));
    }
  }
  return { netOf, nets, used };
}

// Build a module's generated source, split into the locked `head` (everything
// derived from the block diagram) and `tail` ("endmodule"). The editable inline
// HDL (mod.body) is deliberately excluded, so the dock can slot an editable box
// between head and tail.
function moduleSegments(mod, svNameOf) {
  const { netOf, nets, used } = buildNets(mod);
  const prims = mod.blocks.filter((b) => b.kind !== "instance");
  const insts = mod.blocks.filter((b) => b.kind === "instance");
  const H = [];

  // dangling pins (unconnected) become declared internal wires
  const extraWires = [];
  for (const b of mod.blocks) for (const p of b.ports) {
    if (netOf[p.id]) continue;
    let base = `n_${sanitize(ownerName(b)) || "x"}_${sanitize(p.name) || "p"}`, name = base, k = 1;
    while (used.has(name)) name = `${base}_${k++}`; used.add(name);
    netOf[p.id] = name; extraWires.push({ name, width: parseInt(p.width, 10) || 1 });
  }
  const netName = (pid) => netOf[pid] || "";

  const tindex = {}; mod.tports.forEach((t, i) => (tindex[t.id] = i));
  const portNets = nets.filter((n) => n.top).sort((a, b) => (tindex[a.tportId] ?? 1e9) - (tindex[b.tportId] ?? 1e9));
  const internalNets = nets.filter((n) => !n.top).concat(extraWires);

  const svName = svNameOf[mod.id];
  if (portNets.length) {
    H.push(`module ${svName} (`);
    portNets.forEach((n, i) => {
      const dir = (n.dir === "output" ? "output" : "input").padEnd(6), rng = widthRange(n.width), rp = rng ? rng + " " : "";
      H.push(`    ${dir} logic ${rp}${n.name}${i < portNets.length - 1 ? "," : ""}`);
    });
    H.push(`);`);
  } else { H.push(`module ${svName};`); }

  if (internalNets.length) { H.push(""); internalNets.forEach((n) => H.push(`    logic ${widthRange(n.width) ? widthRange(n.width) + " " : ""}${n.name};`)); }
  H.push("");

  // primitive logic: continuous assigns, plus procedural blocks consolidated by
  // { kind, sensitivity } so N flip-flops on the same clock share one always_ff.
  const assigns = [];
  const procGroups = new Map();   // "kind@@sens" -> { kind, sens, stmts:[] }
  prims.forEach((b) => {
    const t = typeOf(b); if (!t) return;
    if (t.proc) {
      const { kind, sens, stmt } = t.proc({ block: b, netName });
      const key = `${kind}@@${sens || ""}`;
      if (!procGroups.has(key)) procGroups.set(key, { kind, sens: sens || "", stmts: [] });
      procGroups.get(key).stmts.push(stmt);
    } else if (t.emit) {
      t.emit({ block: b, netName }).split("\n").forEach((l) => assigns.push(l));
    }
  });
  assigns.forEach((l) => H.push(l));
  if (assigns.length) H.push("");
  for (const { kind, sens, stmts } of procGroups.values()) {
    const header = sens ? `${kind} @(${sens})` : kind;
    if (stmts.length === 1) { H.push(`    ${header}`, `        ${stmts[0]}`); }
    else { H.push(`    ${header} begin`); stmts.forEach((s) => H.push(`        ${s}`)); H.push(`    end`); }
    H.push("");
  }

  // sub-module instantiations
  const instUsed = new Set();
  insts.forEach((b) => {
    const def = state.modules[b.ref]; if (!def) return;
    const dsv = svNameOf[b.ref];
    let inst = `u_${dsv || "m"}`, k = 1;
    while (instUsed.has(inst)) inst = `u_${dsv || "m"}_${k++}`; instUsed.add(inst);
    H.push(`    ${dsv} ${inst} (`);
    b.ports.forEach((p, i, arr) => {
      const t = def.tports.find((x) => x.id === p.tref);
      H.push(`        .${sanitize(t?.name || p.name)} (${netName(p.id)})${i < arr.length - 1 ? "," : ""}`);
    });
    H.push(`    );`, "");
  });

  return { head: H.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, ""), tail: "endmodule" };
}

// inline HDL (mod.body) formatted for insertion into the module body.
function inlineHDL(mod) {
  if (!mod.body || !mod.body.trim()) return "";
  return "\n    // inline HDL\n" +
    mod.body.replace(/\r/g, "").split("\n").map((l) => (l ? "    " + l : "")).join("\n");
}

// Full-design emit: head + inline HDL + tail, preserving prior output.
function emitModule(mod, svNameOf, L) {
  const { head, tail } = moduleSegments(mod, svNameOf);
  L.push(head + inlineHDL(mod), "", tail, "");
}

// Unique SystemVerilog name per module id (top reserves "top" first).
function computeSvNames() {
  const top = state.modules.top;
  const nonTop = state.order.map((id) => state.modules[id]).filter(Boolean);
  const svNameOf = {}, usedNames = new Set();
  for (const m of [top, ...nonTop]) {
    let base = sanitize(m.name) || (m.isTop ? "top" : "module"), name = base, k = 1;
    while (usedNames.has(name)) name = `${base}_${k++}`; usedNames.add(name); svNameOf[m.id] = name;
  }
  return { svNameOf, top, nonTop };
}

// Top module's interface as the generated SystemVerilog sees it: the DUT name
// plus its ports in declaration order, with the exact (sanitized, deduped) net
// names emitted by moduleSegments so a testbench connects by name cleanly.
export function topInterface() {
  const { svNameOf, top } = computeSvNames();
  const { nets } = buildNets(top);
  const tindex = {}; top.tports.forEach((t, i) => (tindex[t.id] = i));
  const ports = nets.filter((n) => n.top)
    .sort((a, b) => (tindex[a.tportId] ?? 1e9) - (tindex[b.tportId] ?? 1e9))
    .map((n) => ({ name: n.name, width: n.width, dir: n.dir === "output" ? "output" : "input" }));
  return { svName: svNameOf[top.id], ports };
}

// Fully-editable testbench boilerplate: timescale, DUT signals, instantiation of
// top as `dut`, a $dumpfile/$dumpvars(0, tb) block, and a stimulus stub.
export function generateTestbench() {
  const { svName, ports } = topInterface();
  const inputs = ports.filter((p) => p.dir !== "output");
  // `logic` works for both procedurally-driven inputs and DUT-driven outputs
  // under -g2012, so the testbench needs no reg/wire split.
  const decl = (p) => {
    const rng = widthRange(p.width); return `    logic ${rng ? rng + " " : ""}${p.name};`;
  };
  const L = [];
  L.push("`timescale 1ns/1ps", "", "module tb;", "");
  if (ports.length) { ports.forEach((p) => L.push(decl(p))); L.push(""); }
  // instantiate the design under test
  if (ports.length) {
    L.push(`    ${svName} dut (`);
    ports.forEach((p, i) => L.push(`        .${p.name} (${p.name})${i < ports.length - 1 ? "," : ""}`));
    L.push(`    );`, "");
  } else { L.push(`    ${svName} dut ();`, ""); }
  // dump all signals to the VCD the backend expects
  L.push(`    initial begin`,
    `        $dumpfile("waves.vcd");`,
    `        $dumpvars(1, tb);   // 1 = just the DUT's I/O; use 0 for the full hierarchy`,
    `    end`, "");
  // stimulus stub
  L.push(`    initial begin`);
  if (inputs.length) L.push(`        ${inputs.map((p) => `${p.name} = 0`).join("; ")};`);
  L.push(`        #10;`, `        // TODO: drive your inputs here`, `        #10;`, `        $finish;`, `    end`, "", "endmodule", "");
  return L.join("\n");
}

// The testbench source to compile/show: the user's saved buffer, or fresh
// boilerplate when it's still empty. Pure — never mutates state.
export function getTestbench() {
  return (state.testbench && state.testbench.trim()) ? state.testbench : generateTestbench();
}

export function generateSV() {
  const { svNameOf, top, nonTop } = computeSvNames();
  const L = [];
  L.push(`// Generated by sandronelog v${VERSION} — ${nonTop.length + 1} module(s)`, "");
  nonTop.forEach((m) => emitModule(m, svNameOf, L));   // definitions first
  L.push(`// ---- top ----`);
  emitModule(top, svNameOf, L);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// One module's source, split for the dock editor: locked head / editable body / locked tail.
export function moduleCode(id) {
  const { svNameOf } = computeSvNames();
  const mod = state.modules[id];
  const { head, tail } = moduleSegments(mod, svNameOf);
  return { head, tail, body: mod.body || "" };
}

// Single-pass SystemVerilog tokenizer -> highlighted HTML. Sticky (`y`) regexes
// match one token at the current offset, so (unlike chained .replace) spans can
// never nest or corrupt each other — safe to run over live, half-typed editor
// text. Used for both the locked panes and the editable highlight overlay.
const HL_RULES = [
  ["cm",  /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],                       // comments
  ["str", /"(?:\\.|[^"\\\n])*"/y],                                // string literal
  ["pre", /`\w+/y],                                               // compiler directive
  ["sys", /\$\w+/y],                                              // system task/function
  ["rng", /\[\s*\d+\s*:\s*\d+\s*\]/y],                            // bit range
  ["num", /\d*'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ?_]+|\b\d[\d_]*\b/y], // sized/plain number
  ["out", /\boutput\b/y],
  ["dir", /\b(?:input|inout)\b/y],
  ["kw",  /\b(?:module|endmodule|begin|end|initial|final|always|always_ff|always_comb|always_latch|assign|posedge|negedge|if|else|for|while|do|repeat|forever|case|casez|casex|endcase|default|logic|reg|wire|bit|int|integer|real|time|genvar|parameter|localparam|generate|endgenerate|function|endfunction|task|endtask|typedef|enum|struct|union|packed|signed|unsigned|return|break|continue|package|endpackage|import)\b/y],
];

export function highlightSV(code) {
  let i = 0, out = "";
  const n = code.length;
  while (i < n) {
    let matched = false;
    for (const [cls, re] of HL_RULES) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m) { out += `<span class="${cls}">${esc(m[0])}</span>`; i = re.lastIndex; matched = true; break; }
    }
    if (matched) continue;
    // identifiers & anything else pass through escaped; consume whole words so
    // a keyword-like prefix (e.g. "moduleName") isn't re-scanned mid-token.
    if (/[A-Za-z_]/.test(code[i])) {
      let j = i + 1; while (j < n && /\w/.test(code[j])) j++;
      out += esc(code.slice(i, j)); i = j;
    } else { out += esc(code[i]); i++; }
  }
  return out;
}

/* ---------------- dock (per-module editor vs full design) ---------------- */
let dockMode = "module";   // "module" | "full"
export function setDockMode(m) { dockMode = m; renderDock(); }
export function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }

// Update the locked generated segments + full raw + stats. Never writes the
// editable textarea, so typing is never interrupted or the caret lost.
export function refreshSV() {
  const full = generateSV();
  $("#svOut").dataset.raw = full;
  const mod = state.modules[state.activeId];
  $("#dockTitle").textContent = dockMode === "tb" ? "tb.sv" : `${mod.name}.sv`;
  document.querySelectorAll("#dockMode [data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === dockMode));
  if (dockMode === "full") {
    $("#svOut").innerHTML = highlightSV(full);
  } else if (dockMode === "module") {
    const { head, tail } = moduleCode(state.activeId);
    $("#genHead").innerHTML = highlightSV(head) + `\n<span class="cm">    // ── your HDL (editable) ──</span>`;
    $("#genTail").innerHTML = highlightSV(tail);
  }
  // tb mode: the #tbEdit textarea is user-owned; never overwrite it here.
  const insts = mod.blocks.filter((b) => b.kind === "instance").length;
  $("#statline").innerHTML =
    `<span><b>${Object.keys(state.modules).length}</b> modules</span>` +
    `<span><b>${mod.blocks.length}</b> blocks here</span>` +
    `<span><b>${insts}</b> instances</span>` +
    `<span><b>${mod.tports.length}</b> ports</span>`;
}

// Called on tab switch / mode toggle: choose editor vs full pre, load the textarea.
export function renderDock() {
  $("#editor").style.display = dockMode === "module" ? "" : "none";
  $("#svOut").style.display = dockMode === "full" ? "" : "none";
  $("#tbEditor").style.display = dockMode === "tb" ? "" : "none";
  if (dockMode === "module") { const ta = $("#hdlEdit"); ta.value = state.modules[state.activeId].body || ""; autoGrow(ta); ta.__sync && ta.__sync(); }
  if (dockMode === "tb") {
    if (!state.testbench || !state.testbench.trim()) state.testbench = generateTestbench();
    const ta = $("#tbEdit"); ta.value = state.testbench; ta.__sync && ta.__sync();
  }
  refreshSV();
}

// Text the Copy button yields: the shown module (module mode) or the whole design.
export function currentDockText() {
  if (dockMode === "tb") return getTestbench();
  if (dockMode === "full") return $("#svOut").dataset.raw || "";
  const { head, tail, body } = moduleCode(state.activeId);
  const b = body.trim()
    ? "\n    // inline HDL\n" + body.replace(/\r/g, "").split("\n").map((l) => (l ? "    " + l : "")).join("\n")
    : "";
  return `${head}${b}\n${tail}\n`;
}

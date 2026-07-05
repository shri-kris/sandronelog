// Block-type registry — the single declarative source of truth for every kind
// of block. Rendering, palette, code generation and persistence all read from
// here, so adding a new block = adding one entry to `blockTypes`.
//
// Entry shape:
//   { id, label, category, kind:'module'|'primitive',
//     editableName, editablePorts, editableBody,
//     ports:[{name,dir,width}], glyph,
//     emit({block, netName}) }   // primitives only
//
// - kind 'module'    : renders the full editable module UI; codegen emits a
//                      `module … endmodule` definition and instantiates it in `top`.
// - kind 'primitive' : fixed 1-bit ports; codegen calls emit() to place an
//                      assign/always_ff statement directly inside `top`.

export const CATEGORIES = ["Sources", "Gates", "Sequential", "Other"];

/* ---- inline SVG glyphs (currentColor) ---- */
const g = (inner) =>
  `<svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
const BUBBLE = `<circle cx="19" cy="10" r="1.7" stroke-width="1.4"/>`;
const AND_BODY = `<path d="M5 3 H12 A7 7 0 0 1 12 17 H5 Z"/>`;
const OR_BODY = `<path d="M4 3 Q11 4 17 10 Q11 16 4 17 Q8 10 4 3 Z"/>`;
const XOR_EXTRA = `<path d="M1.5 3 Q5.5 10 1.5 17"/>`;
const NOT_BODY = `<path d="M6 3 L15 10 L6 17 Z"/>`;
const constGlyph = (n) =>
  g(`<rect x="4" y="4" width="16" height="12" rx="2"/><text x="12" y="13.5" font-size="9" text-anchor="middle" fill="currentColor" stroke="none" font-family="monospace">${n}</text>`);

/* ---- port templates ---- */
const IN2 = () => [
  { name: "a", dir: "input", width: 1 },
  { name: "b", dir: "input", width: 1 },
  { name: "y", dir: "output", width: 1 },
];
const IN1 = () => [
  { name: "a", dir: "input", width: 1 },
  { name: "y", dir: "output", width: 1 },
];

/* ---- registry ---- */
export const blockTypes = {};
const reg = (def) => { blockTypes[def.id] = { editableName: false, editablePorts: false, editableBody: false, ...def }; };

// binary gate helper: expr(a,b) -> SV expression string
const gate2 = (id, label, glyph, expr) => reg({
  id, label, category: "Gates", kind: "primitive", ports: IN2(), glyph,
  emit: ({ block, netName }) => {
    const a = netName(block.ports[0].id), b = netName(block.ports[1].id), y = netName(block.ports[2].id);
    return `    assign ${y} = ${expr(a, b)};`;
  },
});

/* Sources */
const constBlock = (id, label, val) => reg({
  id, label, category: "Sources", kind: "primitive",
  ports: [{ name: "y", dir: "output", width: 1 }], glyph: constGlyph(val === "1'b1" ? "1" : "0"),
  emit: ({ block, netName }) => `    assign ${netName(block.ports[0].id)} = ${val};`,
});
constBlock("const0", "const 0", "1'b0");
constBlock("const1", "const 1", "1'b1");

/* Gates */
gate2("and", "AND", g(AND_BODY), (a, b) => `${a} & ${b}`);
gate2("or", "OR", g(OR_BODY), (a, b) => `${a} | ${b}`);
gate2("xor", "XOR", g(OR_BODY + XOR_EXTRA), (a, b) => `${a} ^ ${b}`);
gate2("nand", "NAND", g(AND_BODY + BUBBLE), (a, b) => `~(${a} & ${b})`);
gate2("nor", "NOR", g(OR_BODY + BUBBLE), (a, b) => `~(${a} | ${b})`);
gate2("xnor", "XNOR", g(OR_BODY + XOR_EXTRA + BUBBLE), (a, b) => `~(${a} ^ ${b})`);
reg({
  id: "not", label: "NOT", category: "Gates", kind: "primitive", ports: IN1(), glyph: g(NOT_BODY + BUBBLE),
  emit: ({ block, netName }) => `    assign ${netName(block.ports[1].id)} = ~${netName(block.ports[0].id)};`,
});

/* Sequential */
// `proc` primitives contribute to a procedural block. codegen groups all procs
// with the same { kind, sens } into one always_ff/always_comb block.
reg({
  id: "dff", label: "D flip-flop", category: "Sequential", kind: "primitive",
  ports: [{ name: "clk", dir: "input", width: 1 }, { name: "d", dir: "input", width: 1 }, { name: "q", dir: "output", width: 1 }],
  glyph: g(`<rect x="5" y="3" width="14" height="14" rx="1.5"/><path d="M5 12 l3 -2 l-3 -2"/>`),
  proc: ({ block, netName }) => ({
    kind: "always_ff",
    sens: `posedge ${netName(block.ports[0].id)}`,
    stmt: `${netName(block.ports[2].id)} <= ${netName(block.ports[1].id)};`,
  }),
});

/* Other */
reg({
  id: "buffer", label: "Buffer", category: "Other", kind: "primitive", ports: IN1(), glyph: g(NOT_BODY),
  emit: ({ block, netName }) => `    assign ${netName(block.ports[1].id)} = ${netName(block.ports[0].id)};`,
});
reg({
  id: "mux2", label: "Mux 2:1", category: "Other", kind: "primitive",
  ports: [{ name: "sel", dir: "input", width: 1 }, { name: "a", dir: "input", width: 1 }, { name: "b", dir: "input", width: 1 }, { name: "y", dir: "output", width: 1 }],
  glyph: g(`<path d="M6 3 L16 8 L16 12 L6 17 Z"/>`),
  emit: ({ block, netName }) => {
    const sel = netName(block.ports[0].id), a = netName(block.ports[1].id), b = netName(block.ports[2].id), y = netName(block.ports[3].id);
    return `    assign ${y} = ${sel} ? ${b} : ${a};`;
  },
});

// Registry lookup for primitive blocks (instances are handled by kind, not type).
export const typeOf = (b) => blockTypes[b.type];

// Glyph for the "New module" palette item and instance block headers.
export const MODULE_GLYPH = g(`<rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M4 8 H1M4 12 H1M20 8 H23M20 12 H23"/>`);

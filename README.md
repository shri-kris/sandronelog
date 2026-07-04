# sandronelog · v0.1

A browser-based visual editor for digital logic: drag blocks onto a canvas, wire
their ports, define interface ports, and get live **SystemVerilog**. Pure static
front end — no backend, no build step.

Designs are **hierarchical**: every module has its own canvas, opened as a **tab**.
A module can be built from gates and *other modules* (reusable — one definition,
many instances), so a whole design can be assembled from primitives without typing HDL.

## Run locally

ES modules require a server (opening `index.html` via `file://` won't work):

```bash
cd sandronelog
python -m http.server 8000   # then open http://localhost:8000
```

## Blocks

- **Primitives** — fixed-port blocks that emit a statement inside their parent module: gates (AND/OR/NOT/NAND/NOR/XOR/XNOR), const 0/1, D flip-flop, buffer, 2:1 mux.
- **Module instances** — reference a module definition; ⤢ or double-click opens that module's own canvas tab. Their interface (input/output pins) is set by the ports panel on the module's sheet. Drop the same module from the palette's **Modules** group many times to reuse one definition.

## Architecture

Two ideas drive everything: the **block-type registry** (`src/blockTypes.js`) for
primitives, and the **module hierarchy** (`src/sheets.js`) — a design is a set of
module definitions, one shown per tab. `state.blocks/wires/tports/view` are
accessors onto the active sheet, so most code stays sheet-agnostic.

| File | Role |
|---|---|
| `index.html`, `styles/styles.css` | markup + styles |
| `src/blockTypes.js` | **registry** — one entry per primitive type |
| `src/sheets.js` | **hierarchy** — modules, instances, tabs, reconciliation |
| `src/state.js` | modules + active-sheet proxies + `VERSION` |
| `src/model.js` | mutations: blocks, wires, interface ports, selection |
| `src/render.js` | block / pin / interface-panel DOM |
| `src/wires.js` | wire geometry + SVG rendering |
| `src/routing.js` | wire-drawing + attach-to-port menu |
| `src/interactions.js` | drag, pan, zoom, keyboard |
| `src/palette.js` | palette rail (primitives + Modules group) |
| `src/codegen.js` | per-module union-find nets → SystemVerilog |
| `src/persistence.js` | JSON save / load (schema `version: 4`, migrates v3) |
| `src/dom.js`, `src/theme.js`, `src/main.js` | helpers, theme, entry point |

## Add a new primitive

Add one entry to `src/blockTypes.js` — no other file needs touching:

```js
gate2("xor3", "XOR3", g(OR_BODY), (a, b) => `${a} ^ ${b}`);   // gate helper
// or a full entry: { id, label, category, kind:'primitive',
//   ports:[...], glyph, emit({block, netName}) => "    assign ..." }
```

Primitives have fixed ports and emit a statement into their parent module.
User-defined **modules** are created in-app (palette → New module) and emit their
own `module … endmodule` definition.

## Deploy

Static files — push to GitHub and enable **Pages**, or connect the repo to
Cloudflare Pages / Netlify / Vercel. Every push redeploys. Asset paths are
relative, so it works under a subpath (`user.github.io/sandronelog/`) too.

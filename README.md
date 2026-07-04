# sandronelog

A browser-based visual editor for digital logic: drag blocks onto a canvas, wire
their ports, define top-level ports, and get live **SystemVerilog**. Pure static
front end — no backend, no build step.

## Run locally

ES modules require a server (opening `index.html` via `file://` won't work):

```bash
cd sandronelog
python -m http.server 8000   # then open http://localhost:8000
```

## Blocks

- **Module** — generic block with editable name, ports, and free-text body → emits `module … endmodule` + instantiation.
- **Primitives** — fixed-port blocks that emit a statement inside `top`: gates (AND/OR/NOT/NAND/NOR/XOR/XNOR), const 0/1, D flip-flop, buffer, 2:1 mux.

## Architecture

Everything is driven by the **block-type registry** in `src/blockTypes.js` — rendering,
palette, code generation, and save/load all read from it.

| File | Role |
|---|---|
| `index.html`, `styles/styles.css` | markup + styles |
| `src/blockTypes.js` | **registry** — one entry per block type |
| `src/state.js` | shared state + transient session flags |
| `src/model.js` | mutations: blocks, ports, wires, top ports, selection |
| `src/render.js` | block / port / top-port DOM |
| `src/wires.js` | wire geometry + SVG rendering |
| `src/routing.js` | wire-drawing + attach-to-top-port menu |
| `src/interactions.js` | drag, pan, zoom, keyboard |
| `src/palette.js` | palette rail built from the registry |
| `src/codegen.js` | union-find nets → SystemVerilog |
| `src/persistence.js` | JSON save / load (`version: 3`) |
| `src/dom.js`, `src/theme.js`, `src/main.js` | helpers, theme, entry point |

## Add a new block

Add one entry to `src/blockTypes.js` — no other file needs touching:

```js
gate2("xor3", "XOR3", g(OR_BODY), (a, b) => `${a} ^ ${b}`);   // gate helper
// or a full entry: { id, label, category, kind:'primitive',
//   ports:[...], glyph, emit({block, netName}) => "    assign ..." }
```

`kind:'primitive'` blocks have fixed ports and emit a statement into `top`;
`kind:'module'` blocks are editable and emit their own module definition.

## Deploy

Static files — push to GitHub and enable **Pages**, or connect the repo to
Cloudflare Pages / Netlify / Vercel. Every push redeploys. Asset paths are
relative, so it works under a subpath (`user.github.io/sandronelog/`) too.

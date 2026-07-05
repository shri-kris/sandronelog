# sandronelog · v0.1

A browser-based visual editor for digital logic: drag blocks onto a canvas, wire
their ports, define interface ports, and get live **SystemVerilog**. 

Now includes an **Express-based compiler backend** and client-side **Waveform Viewer** to execute and simulate SystemVerilog designs using Icarus Verilog (`iverilog`) and `vvp`.

Designs are **hierarchical**: every module has its own canvas, opened as a **tab**.
A module can be built from gates and *other modules* (reusable — one definition,
many instances), so a whole design can be assembled from primitives without typing HDL.

---

## Running the Project

You can run **sandronelog** either as a pure static front end, or with the full compiler & simulation stack.

### Option 1: Full Stack via Docker Compose (Recommended)
This spins up both the Nginx static frontend (port `80`) and the Node.js compiler backend (port `5000`).

1. **Build the Sandbox Image** (required for the backend's default Docker compilation mode):
   ```bash
   docker build -t sandronelog-sandbox -f backend/Dockerfile.sandbox backend/
   ```
2. **Start the Stack**:
   ```bash
   docker compose up --build
   ```
3. Open [http://localhost](http://localhost) in your browser.

---

### Option 2: Full Stack Local execution (No Docker)
If you have node, `iverilog`, and `vvp` installed on your machine:

1. **Start the Backend**:
   ```bash
   cd backend
   npm install
   # Copy .env and change USE_DOCKER=false
   node app.js
   ```
2. **Start the Frontend**:
   ```bash
   # Run from root directory
   python -m http.server 8000
   ```
3. Open [http://localhost:8000](http://localhost:8000) in your browser.

---

### Option 3: Pure Static Frontend
To run only the static block visualizer without the ability to run simulations:
```bash
python -m http.server 8000   # then open http://localhost:8000
```

---

## Compiler & Waveform Simulation

### How it works
1. Press the **Compile & Run** button in the SystemVerilog panel.
2. The frontend gathers the generated code and posts it to the `/api/compile` endpoint of the backend.
3. The backend runs `iverilog` to compile and check for syntax errors or warnings, then runs the simulation using `vvp`.
4. Any errors or console logs are streamed back to the frontend **Console Logs** panel.
5. If wave files (`.vcd`) are generated, they are parsed by `src/waves.js` on the client and rendered to an HTML5 canvas.

### Generating Waveforms
To generate waveforms, you must define simulation stimuli (a testbench) by typing code into the text input area of your top-level module (or any module). For example:

```systemverilog
initial begin
  $dumpfile("waves.vcd");
  $dumpvars(0, top); // Replace 'top' with your top-level module name if different
  
  // Apply inputs over time
  A = 0; B = 0; #10;
  A = 1; B = 0; #10;
  A = 0; B = 1; #10;
  A = 1; B = 1; #10;
  $finish;
end
```

---

## Architecture

| File / Folder | Role |
|---|---|
| **Frontend** | |
| `index.html`, `styles/styles.css` | UI markup + visual layout |
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
| `src/api.js` | helper to communicate with compiler backend API |
| `src/waves.js` | **VCD parser** + waveform HTML5 Canvas renderer |
| `src/dom.js`, `src/theme.js`, `src/main.js` | helpers, theme management, main entry point |
| **Backend** | |
| `backend/app.js` | Node/Express web server defining simulation endpoints |
| `backend/compiler.js` | Orchestrator executing `iverilog` & `vvp` locally or inside a sandbox |
| `backend/Dockerfile` | Docker environment for running the Node API backend |
| `backend/Dockerfile.sandbox` | Docker sandbox container executing isolated simulations |
| `docker-compose.yml` | Full container orchestrator (static nginx frontend + express backend) |

---

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


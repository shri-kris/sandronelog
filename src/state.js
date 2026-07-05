// Central mutable state. A design is a set of module definitions; the canvas
// shows one active module ("sheet") at a time.

export const VERSION = "0.1";

export const state = {
  modules: {},        // id -> { id, name, isTop, blocks[], wires[], tports[], view }
  order: [],          // non-top module ids in creation order (palette + codegen)
  openTabs: [],       // module ids open as tabs (top always first)
  activeId: null,     // module currently shown on the canvas
  selected: null,     // {type:'block'|'wire', id} on the active sheet
  testbench: "",      // design-global editable testbench source (instantiates top as DUT)
};

// Transient UI session flags (not persisted).
export const session = {
  route: null,        // active wire routing: { from, sticky }
  drag: null,         // active block/pan drag
  tempPath: null,     // in-flight wire path string while routing
};

let _id = 1;
export const uid = (p) => `${p}${_id++}`;

// port id -> rendered .dot element, for the ACTIVE sheet only.
export const portDots = new Map();

// Active-sheet proxies: reading/writing state.blocks/wires/tports/view targets
// the active module. This lets model/render/wires/routing/interactions keep
// operating on `state.blocks` etc. unchanged. codegen/persistence use
// state.modules directly and ignore these.
const activeSheet = () => state.modules[state.activeId];
for (const key of ["blocks", "wires", "tports", "view"]) {
  Object.defineProperty(state, key, {
    get() { return activeSheet()[key]; },
    set(v) { activeSheet()[key] = v; },
    enumerable: true,
  });
}

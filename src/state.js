// Central mutable state shared across modules.

export const state = {
  blocks: [],
  wires: [],          // {id, from, to, tag?}  tag wires: from=block port, to=tport id
  tports: [],         // {id, name, dir:'input'|'output', width}
  view: { x: 60, y: 60, scale: 1 },
  selected: null,     // {type:'block'|'wire', id}
};

// Transient UI session flags (not persisted). Kept here so render/routing/
// interactions modules can share them without import cycles on live values.
export const session = {
  route: null,        // active wire routing: { from, sticky }
  drag: null,         // active block/pan drag
  tempPath: null,     // in-flight wire path string while routing
};

let _id = 1;
export const uid = (p) => `${p}${_id++}`;

// Maps a port id -> its rendered .dot element (for wire geometry).
export const portDots = new Map();

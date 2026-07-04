// Entry point: wires the top bar, mounts the palette, and seeds a demo design.
// Importing these modules also registers their global listeners (canvas
// interactions, wire routing context menu, theme toggle).

import { $, download, toast } from "./dom.js";
import { state } from "./state.js";
import { addBlock, makeTPort, tagPort, addWire, addTPort, clearSelect } from "./model.js";
import { renderTPorts } from "./render.js";
import { refreshSV } from "./codegen.js";
import { zoomBy, applyView } from "./interactions.js";
import { applyThemeIcon } from "./theme.js";
import { mountPalette } from "./palette.js";
import { serialize, loadDesign } from "./persistence.js";
import "./routing.js";

/* ---- boot ---- */
mountPalette();
applyThemeIcon();
applyView();

/* ---- top-bar / dock chrome ---- */
$("#zoomIn").onclick = () => zoomBy(1.15);
$("#zoomOut").onclick = () => zoomBy(1 / 1.15);
$("#fitBtn").onclick = () => { state.view = { x: 60, y: 60, scale: 1 }; applyView(); };
$("#svBtn").onclick = () => $("#dock").classList.toggle("collapsed");
$("#closeDock").onclick = () => $("#dock").classList.add("collapsed");
$("#tphead").onclick = () => $("#tpanel").classList.toggle("collapsed");
document.querySelectorAll("[data-addtp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); addTPort(b.dataset.addtp); }));
$("#copyBtn").onclick = async () => { try { await navigator.clipboard.writeText($("#svOut").dataset.raw || ""); toast("Copied to clipboard"); } catch { toast("Copy failed — select manually"); } };
$("#dlBtn").onclick = () => { download($("#svOut").dataset.raw || "", $("#fname").value || "top.sv"); toast("Downloaded " + ($("#fname").value || "top.sv")); };
$("#saveBtn").onclick = () => { download(serialize(), "sandronelog-design.json", "application/json"); toast("Design saved"); };
$("#loadBtn").onclick = () => $("#fileIn").click();
$("#fileIn").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { loadDesign(JSON.parse(r.result)); toast("Design loaded"); } catch { toast("Could not read that file"); } };
  r.readAsText(f); e.target.value = "";
};

/* ---- seed demo ---- */
const counter = addBlock({ quiet: true, type: "module", name: "counter", x: 110, y: 150,
  body: "always_ff @(posedge clk)\n    if (rst) count <= '0;\n    else     count <= count + 1'b1;",
  ports: [{ name: "clk", dir: "input" }, { name: "rst", dir: "input" }, { name: "count", dir: "output", width: 8 }] });
const led = addBlock({ quiet: true, type: "module", name: "led_driver", x: 510, y: 170,
  body: "assign led = value;",
  ports: [{ name: "clk", dir: "input" }, { name: "value", dir: "input", width: 8 }, { name: "led", dir: "output", width: 8 }] });
const tClk = makeTPort("clk", "input", 1), tRst = makeTPort("rst", "input", 1), tLed = makeTPort("led_out", "output", 8);
tagPort(counter.ports[0].id, tClk.id);
tagPort(counter.ports[1].id, tRst.id);
tagPort(led.ports[0].id, tClk.id);
tagPort(led.ports[2].id, tLed.id);
addWire(counter.ports[2].id, led.ports[1].id);   // count -> value (8-bit → width label)
renderTPorts(); clearSelect(); refreshSV();

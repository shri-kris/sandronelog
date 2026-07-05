// Entry point: boots the design, wires the top bar, and seeds a demo hierarchy.

import { $, download, toast } from "./dom.js";
import { state, VERSION } from "./state.js";
import { addBlock, addWire, makeTPort, tagPort, addTPort } from "./model.js";
import { createTop, createModule, addInstance, activateSheet, renderSheet } from "./sheets.js";
import { refreshSV, setDockMode, currentDockText, autoGrow } from "./codegen.js";
import { zoomBy, applyView } from "./interactions.js";
import { applyThemeIcon } from "./theme.js";
import { mountPalette } from "./palette.js";
import { serialize, loadDesign } from "./persistence.js";
import "./routing.js";

/* ---- boot ---- */
createTop();
mountPalette();
applyThemeIcon();
$("#ver").textContent = "v" + VERSION;

/* ---- top-bar / dock chrome ---- */
$("#zoomIn").onclick = () => zoomBy(1.15);
$("#zoomOut").onclick = () => zoomBy(1 / 1.15);
$("#fitBtn").onclick = () => { state.view = { x: 60, y: 60, scale: 1 }; applyView(); };
$("#svBtn").onclick = () => $("#dock").classList.toggle("collapsed");
$("#closeDock").onclick = () => $("#dock").classList.add("collapsed");
$("#tphead").onclick = () => $("#tpanel").classList.toggle("collapsed");
$("#dockMode").querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setDockMode(b.dataset.mode)));
$("#hdlEdit").addEventListener("input", (e) => {
  state.modules[state.activeId].body = e.target.value;
  autoGrow(e.target);
  refreshSV();
});
document.querySelectorAll("[data-addtp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); addTPort(b.dataset.addtp); }));
$("#copyBtn").onclick = async () => { try { await navigator.clipboard.writeText(currentDockText()); toast("Copied to clipboard"); } catch { toast("Copy failed — select manually"); } };
$("#dlBtn").onclick = () => { download($("#svOut").dataset.raw || "", $("#fname").value || "top.sv"); toast("Downloaded " + ($("#fname").value || "top.sv")); };
$("#saveBtn").onclick = () => { download(serialize(), "sandronelog-design.json", "application/json"); toast("Design saved"); };
$("#loadBtn").onclick = () => $("#fileIn").click();
$("#fileIn").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { loadDesign(JSON.parse(r.result)); toast("Design loaded"); } catch { toast("Could not read that file"); } };
  r.readAsText(f); e.target.value = "";
};

/* ---- seed demo: a half_adder built from gates, instantiated on top ---- */
const ha = createModule({ name: "half_adder", tports: [
  { name: "a", dir: "input" }, { name: "b", dir: "input" },
  { name: "sum", dir: "output" }, { name: "carry", dir: "output" }] });
activateSheet(ha.id);
{
  const [ta, tb, tsum, tcarry] = ha.tports;
  const xor = addBlock({ quiet: true, type: "xor", x: 360, y: 150 });
  const and = addBlock({ quiet: true, type: "and", x: 360, y: 300 });
  tagPort(xor.ports[0].id, ta.id); tagPort(xor.ports[1].id, tb.id); tagPort(xor.ports[2].id, tsum.id);
  tagPort(and.ports[0].id, ta.id); tagPort(and.ports[1].id, tb.id); tagPort(and.ports[2].id, tcarry.id);
}
activateSheet("top");
{
  const A = makeTPort("A", "input", 1), B = makeTPort("B", "input", 1);
  const S = makeTPort("SUM", "output", 1), C = makeTPort("CARRY", "output", 1);
  const inst = addInstance(ha.id, { quiet: true, x: 380, y: 190 });
  tagPort(inst.ports[0].id, A.id); tagPort(inst.ports[1].id, B.id);
  tagPort(inst.ports[2].id, S.id); tagPort(inst.ports[3].id, C.id);
}
renderSheet("top");

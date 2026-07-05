// Entry point: boots the design, wires the top bar, and seeds a demo hierarchy.

import { $, download, toast } from "./dom.js";
import { state, VERSION } from "./state.js";
import { addBlock, addWire, makeTPort, tagPort, addTPort } from "./model.js";
import { createTop, createModule, addInstance, activateSheet, renderSheet } from "./sheets.js";
import { refreshSV, setDockMode, currentDockText, autoGrow, generateSV, getTestbench, generateTestbench, renderDock, highlightSV } from "./codegen.js";
import { attachCodeEditor } from "./editor.js";
import { zoomBy, applyView } from "./interactions.js";
import { applyThemeIcon } from "./theme.js";
import { mountPalette } from "./palette.js";
import { serialize, loadDesign } from "./persistence.js";
import "./routing.js";
import { compileDesign } from "./api.js";
import { parseVCD, drawWaveforms } from "./waves.js";

let currentVcdData = null;

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
$("#tbEdit").addEventListener("input", (e) => { state.testbench = e.target.value; });
// Tab-to-indent + live SystemVerilog highlight overlay on the editable panes.
attachCodeEditor($("#hdlEdit"), highlightSV);
attachCodeEditor($("#tbEdit"), highlightSV);
$("#regenTb").addEventListener("click", () => {
  if (state.testbench.trim() && !confirm("Replace the testbench with freshly generated boilerplate?")) return;
  state.testbench = generateTestbench();
  renderDock();
  toast("Testbench regenerated");
});
document.querySelectorAll("[data-addtp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); addTPort(b.dataset.addtp); }));
$("#copyBtn").onclick = async () => { try { await navigator.clipboard.writeText(currentDockText()); toast("Copied to clipboard"); } catch { toast("Copy failed — select manually"); } };
$("#dlBtn").onclick = () => { download(generateSV(), $("#fname").value || "top.sv"); toast("Downloaded " + ($("#fname").value || "top.sv")); };

/* ---- compiler simulation execution ---- */
function switchOutputTab(tabName) {
  document.querySelectorAll("#opTabs .op-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".op-tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === (tabName === "logs" ? "opLogs" : "opWaves"));
  });
  if (tabName === "waves" && currentVcdData) {
    drawWaveforms($("#waveCanvas"), currentVcdData);
  }
}

document.querySelectorAll("#opTabs .op-tab-btn").forEach((btn) => {
  btn.onclick = () => switchOutputTab(btn.dataset.tab);
});

$("#opHead").onclick = () => {
  const panel = $("#outputPanel");
  const isCollapsed = panel.classList.toggle("collapsed");
  $("#closeOutput").textContent = isCollapsed ? "▲" : "▾";
  if (!isCollapsed && currentVcdData) {
    const activeTab = document.querySelector("#opTabs .op-tab-btn.active")?.dataset.tab;
    if (activeTab === "waves") {
      drawWaveforms($("#waveCanvas"), currentVcdData);
    }
  }
};

$("#closeOutput").onclick = (e) => {
  e.stopPropagation();
  $("#opHead").click();
};

window.addEventListener("themechange", () => {
  if (currentVcdData) {
    drawWaveforms($("#waveCanvas"), currentVcdData);
  }
});

$("#runBtn").onclick = async () => {
  const btn = $("#runBtn");
  btn.disabled = true;
  btn.textContent = "Running...";
  
  const consoleOut = $("#consoleOut");
  consoleOut.textContent = "Connecting to compiler server...\n";

  const outputPanel = $("#outputPanel");
  outputPanel.classList.remove("collapsed");
  $("#closeOutput").textContent = "▾";
  switchOutputTab("logs");

  try {
    const svCode = generateSV();
    if (!svCode.trim()) {
      throw new Error("No SystemVerilog code generated to compile.");
    }

    // The testbench (instantiating top as the DUT) is the simulation root.
    if (!state.testbench.trim()) state.testbench = generateTestbench();

    const filesPayload = {
      "design.sv": svCode,
      "tb.sv": getTestbench()
    };

    const response = await compileDesign(filesPayload, true);
    
    consoleOut.textContent = "";
    if (response.stdout) {
      consoleOut.textContent += `[Simulation Console Output]\n${response.stdout}\n`;
    }
    if (response.stderr) {
      consoleOut.textContent += `[Compiler Output / Errors]\n${response.stderr}\n`;
    }
    if (!response.stdout && !response.stderr) {
      consoleOut.textContent += "Compilation successful. No console output generated.\n";
    }

    const waveCanvas = $("#waveCanvas");
    const waveEmpty = $("#waveEmpty");
    
    if (response.vcd) {
      currentVcdData = parseVCD(response.vcd);
      if (currentVcdData && currentVcdData.signals.length > 0) {
        waveEmpty.style.display = "none";
        waveCanvas.style.display = "block";
        drawWaveforms(waveCanvas, currentVcdData);
        switchOutputTab("waves");
        toast("Simulation successful");
      } else {
        waveCanvas.style.display = "none";
        waveEmpty.style.display = "flex";
        waveEmpty.textContent = "VCD file parsed, but no signal traces were found. Make sure you use $dumpvars.";
      }
    } else {
      currentVcdData = null;
      waveCanvas.style.display = "none";
      waveEmpty.style.display = "flex";
      waveEmpty.textContent = "No waveforms were generated. Open the Testbench tab and drive the DUT inputs (it already dumps to waves.vcd) to view waves.";
    }
  } catch (error) {
    consoleOut.textContent += `\nError: ${error.message}`;
    toast("Compile failed");
  } finally {
    btn.disabled = false;
    btn.textContent = "Compile & Run";
  }
};

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

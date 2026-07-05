// Client-side VCD file parser and Canvas waveform renderer.

/**
 * Parses VCD text files into structured signal timelines.
 * @param {string} vcdText Raw VCD file contents
 */
export function parseVCD(vcdText) {
  if (!vcdText) return null;
  const lines = vcdText.split("\n");
  const signals = [];
  const aliasMap = {};
  let inHeader = true;
  let currentTime = 0;
  const allTimes = new Set([0]);

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (inHeader) {
      if (line.startsWith("$var")) {
        // Format: $var type size alias name [range] $end
        const parts = line.split(/\s+/);
        const type = parts[1];
        const size = parseInt(parts[2], 10);
        const alias = parts[3];
        const name = parts.slice(4, parts.length - 1).join(" ");
        
        const sig = {
          type,
          size,
          alias,
          name,
          changes: [] // array of { time, value }
        };
        signals.push(sig);
        aliasMap[alias] = sig;
      } else if (line.startsWith("$enddefinitions")) {
        inHeader = false;
      }
    } else {
      if (line.startsWith("#")) {
        currentTime = parseInt(line.substring(1), 10);
        allTimes.add(currentTime);
      } else if (line.startsWith("b") || line.startsWith("B")) {
        // Vector variable change: b00000001 alias
        const parts = line.split(/\s+/);
        const val = parts[0].substring(1);
        const alias = parts[1];
        const sig = aliasMap[alias];
        if (sig) {
          sig.changes.push({ time: currentTime, value: val });
        }
      } else {
        // 1-bit variable change: 0alias or 1alias
        const val = line[0];
        const alias = line.substring(1);
        const sig = aliasMap[alias];
        if (sig) {
          sig.changes.push({ time: currentTime, value: val });
        }
      }
    }
  }

  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
  
  // Ensure every signal has a value at time 0
  for (const sig of signals) {
    if (sig.changes.length === 0) {
      sig.changes.push({ time: 0, value: sig.size > 1 ? "x" : "x" });
    } else if (sig.changes[0].time > 0) {
      sig.changes.unshift({ time: 0, value: sig.size > 1 ? "x" : "x" });
    }
  }

  return {
    signals,
    times: sortedTimes
  };
}

/**
 * Renders parsed VCD signal structures onto an HTML5 Canvas.
 * @param {HTMLCanvasElement} canvas Canvas target
 * @param {Object} vcdData Parsed VCD object
 */
export function drawWaveforms(canvas, vcdData) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const signals = vcdData.signals;
  const times = vcdData.times;
  const maxTime = times[times.length - 1] || 100;

  // Layout parameters
  const labelWidth = 150;
  const rowHeight = 45;
  const timeScale = 4; // pixels per time unit (ns)
  const startX = labelWidth + 20;
  const paddingRight = 40;
  const canvasWidth = startX + maxTime * timeScale + paddingRight;
  const canvasHeight = signals.length * rowHeight + 50;

  // Resize canvas according to dimensions (or width of parent container if larger)
  canvas.width = Math.max(canvasWidth, canvas.parentElement.clientWidth || 800);
  canvas.height = canvasHeight;

  // Determine current active theme
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const bgCol = isDark ? "#0d1117" : "#ffffff";
  const textCol = isDark ? "#e4ebf2" : "#1b2937";
  const gridCol = isDark ? "#222d39" : "#e5ebf1";
  const waveCol = isDark ? "#49c4d8" : "#0d8ea4";
  const busCol = isDark ? "#e8ad55" : "#b27a1c";
  const labelBg = isDark ? "#151c25" : "#f2f6fa";
  const borderCol = isDark ? "#2a3744" : "#d2dbe4";

  // Clear backdrop
  ctx.fillStyle = bgCol;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. Grid & Time ticks
  ctx.strokeStyle = gridCol;
  ctx.lineWidth = 1;
  ctx.fillStyle = isDark ? "#7e8c9b" : "#5b6975";
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";

  // Draw timing markers along X axis
  const gridStep = Math.max(5, Math.ceil(maxTime / 15));
  for (let t = 0; t <= maxTime; t += gridStep) {
    const x = startX + t * timeScale;
    ctx.beginPath();
    ctx.moveTo(x, 25);
    ctx.lineTo(x, canvasHeight - 20);
    ctx.stroke();

    ctx.fillText(`${t}ns`, x, 15);
  }

  // 2. Wave trace lines
  signals.forEach((sig, idx) => {
    const yCenter = 30 + idx * rowHeight + rowHeight / 2;
    const yHigh = yCenter - 11;
    const yLow = yCenter + 11;

    // Draw horizontal lane split line
    ctx.strokeStyle = gridCol;
    ctx.beginPath();
    ctx.moveTo(0, yCenter + rowHeight / 2);
    ctx.lineTo(canvas.width, yCenter + rowHeight / 2);
    ctx.stroke();

    ctx.lineWidth = 2;

    if (sig.size === 1) {
      // 1-Bit Digital Signal (binary transition line)
      ctx.strokeStyle = waveCol;
      ctx.beginPath();

      const initialVal = sig.changes[0]?.value || "0";
      let lastY = (initialVal === "1") ? yHigh : yLow;
      ctx.moveTo(startX, lastY);

      for (let i = 0; i < sig.changes.length; i++) {
        const change = sig.changes[i];
        const nextX = startX + change.time * timeScale;
        const nextY = (change.value === "1") ? yHigh : yLow;

        ctx.lineTo(nextX, lastY); // draw horizontal to transition point
        ctx.lineTo(nextX, nextY); // draw vertical edge

        lastY = nextY;
      }

      // Fill remaining space to simulation end
      ctx.lineTo(startX + maxTime * timeScale, lastY);
      ctx.stroke();
    } else {
      // Multi-Bit Vector Signal (Bus hexagon cells)
      ctx.strokeStyle = busCol;
      ctx.fillStyle = isDark ? "rgba(232, 173, 85, 0.08)" : "rgba(178, 122, 28, 0.05)";

      for (let i = 0; i < sig.changes.length; i++) {
        const change = sig.changes[i];
        const nextChange = sig.changes[i + 1];
        const currX = startX + change.time * timeScale;
        const nextX = nextChange ? (startX + nextChange.time * timeScale) : (startX + maxTime * timeScale);
        const width = nextX - currX;
        const val = change.value;

        if (width > 0) {
          ctx.beginPath();
          ctx.moveTo(currX, yCenter);
          ctx.lineTo(currX + Math.min(3, width / 2), yHigh);
          ctx.lineTo(nextX - Math.min(3, width / 2), yHigh);
          ctx.lineTo(nextX, yCenter);
          ctx.lineTo(nextX - Math.min(3, width / 2), yLow);
          ctx.lineTo(currX + Math.min(3, width / 2), yLow);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Render value string inside the hexagon bubble
          ctx.fillStyle = textCol;
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          let displayVal = val;
          if (/^[01]+$/.test(val)) {
            displayVal = "h" + parseInt(val, 2).toString(16).toUpperCase();
          }

          const valWidth = ctx.measureText(displayVal).width;
          if (width > valWidth + 8) {
            ctx.fillText(displayVal, currX + width / 2, yCenter);
          }
        }
      }
    }
  });

  // 3. Side Panel overlay (Signal labels, drawn last to sit on top of grid lines)
  ctx.fillStyle = labelBg;
  ctx.fillRect(0, 0, labelWidth, canvas.height);

  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(labelWidth, 0);
  ctx.lineTo(labelWidth, canvas.height);
  ctx.stroke();

  ctx.fillStyle = textCol;
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  signals.forEach((sig, idx) => {
    const yCenter = 30 + idx * rowHeight + rowHeight / 2;
    ctx.fillText(sig.name, 12, yCenter);
  });
}

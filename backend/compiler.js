const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const TEMP_DIR = path.join(__dirname, "temp");
const USE_DOCKER = process.env.USE_DOCKER !== "false"; // Default to true
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "5000", 10);

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Parses Icarus Verilog stderr into structured diagnostics
 * Example error: /app/src/top.sv:12: error: Unknown module type: half_adder
 */
function parseDiagnostics(stderr, userFiles) {
  const diagnostics = [];
  const lines = stderr.split("\n");
  
  // Pattern to match compiler messages
  // Group 1: path, Group 2: line number, Group 3: severity (error/warning), Group 4: message
  const errRegex = /(?:[A-Za-z]:)?([^\s:]+):(\d+):\s+(error|warning):\s+(.*)/i;

  for (const line of lines) {
    const match = line.match(errRegex);
    if (match) {
      const filePath = match[1];
      const lineNum = parseInt(match[2], 10);
      const severity = match[3].toLowerCase();
      const message = match[4];

      // Extract just the filename to match the user's key
      const filename = path.basename(filePath);

      diagnostics.push({
        file: filename,
        line: lineNum,
        type: severity,
        message: message.trim()
      });
    }
  }
  return diagnostics;
}

/**
 * Core compiler runner
 * @param {Object} files Object mapping filename -> file contents
 * @param {boolean} runSimulation Whether to run the vvp simulation
 */
async function compileAndSimulate(files, runSimulation = true) {
  const runId = uuidv4();
  const runDir = path.join(TEMP_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  try {
    // 1. Write all source files to the temporary folder
    const filenames = Object.keys(files);
    for (const name of filenames) {
      // Validate filename to prevent directory traversal
      const safeName = path.basename(name);
      fs.writeFileSync(path.join(runDir, safeName), files[name], "utf8");
    }

    // Identify entry points / all .sv and .v files
    const svFiles = filenames.filter(f => f.endsWith(".sv") || f.endsWith(".v"));
    if (svFiles.length === 0) {
      throw new Error("No SystemVerilog or Verilog source files provided.");
    }

    let compileCmd = "";
    let cleanUpCommands = [];

    if (USE_DOCKER) {
      // Docker path (expects sandronelog-sandbox image to be built)
      // Map the absolute path of the runDir into the docker container
      const absoluteRunDir = path.resolve(runDir).replace(/\\/g, "/"); // normalize Windows paths for Docker
      
      // We run in a shell inside the container to handle wildcards and chaining
      const insideCmd = `iverilog -g2012 -o /app/design.vvp ${svFiles.map(f => `/app/src/${f}`).join(" ")} ${runSimulation ? "&& vvp /app/design.vvp" : ""}`;
      
      // Run docker with a non-root user, memory limit (64MB), and network disabled
      // Set the working directory to the mounted src directory so waveforms (.vcd) are written there.
      compileCmd = `docker run --rm --net=none -m 64m -w /app/src -v "${absoluteRunDir}":/app/src:rw sandronelog-sandbox sh -c "${insideCmd}"`;
    } else {
      // Local execution fallback
      const localOut = path.join(runDir, "design.vvp");
      const sourceList = svFiles.map(f => `"${path.join(runDir, f)}"`).join(" ");
      compileCmd = `iverilog -g2012 -o "${localOut}" ${sourceList}`;
      if (runSimulation) {
        compileCmd += ` && vvp "${localOut}"`;
      }
    }

    // 2. Execute command
    const result = await new Promise((resolve) => {
      // cwd = runDir so a simulation's relative $dumpfile("waves.vcd") lands in
      // the run dir we scan below.
      exec(compileCmd, { cwd: runDir, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      });
    });

    const isTimeout = result.error && result.error.killed;
    
    // 3. Check for generated Waveforms (VCD files)
    let vcdContent = null;
    try {
      // Look for any .vcd file in the directory
      const localFiles = fs.readdirSync(runDir);
      const vcdFile = localFiles.find(f => f.endsWith(".vcd"));
      if (vcdFile) {
        vcdContent = fs.readFileSync(path.join(runDir, vcdFile), "utf8");
      }
    } catch (e) {
      console.error("Error reading VCD file:", e);
    }

    // 4. Build response structure
    let success = !result.error;
    let stdout = result.stdout || "";
    let stderr = result.stderr || "";

    if (isTimeout) {
      success = false;
      stderr += `\nError: Simulation execution timed out after ${TIMEOUT_MS}ms. Make sure you don't have infinite loops in your testbenches.`;
    }

    const diagnostics = parseDiagnostics(stderr, files);

    return {
      success: success && diagnostics.length === 0,
      stdout,
      stderr,
      errors: diagnostics,
      vcd: vcdContent
    };

  } finally {
    // 5. Clean up directory contents and directory itself
    try {
      if (fs.existsSync(runDir)) {
        const files = fs.readdirSync(runDir);
        for (const file of files) {
          fs.unlinkSync(path.join(runDir, file));
        }
        fs.rmdirSync(runDir);
      }
    } catch (err) {
      console.error(`Failed to clean up workspace ${runDir}:`, err);
    }
  }
}

module.exports = {
  compileAndSimulate
};

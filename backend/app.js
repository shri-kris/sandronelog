require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { compileAndSimulate } = require("./compiler");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the static frontend (e.g. GitHub Pages) can contact the API
app.use(cors());

// Increase body limit in case designs contain many source files or large appended logic
app.use(express.json({ limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date() });
});

// Compile endpoint
app.post("/api/compile", async (req, res, next) => {
  try {
    const { files, runSimulation } = req.body;

    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request payload. 'files' object is required."
      });
    }

    const result = await compileAndSimulate(files, runSimulation !== false);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    details: err.message
  });
});

app.listen(PORT, () => {
  console.log(`sandronelog compiler backend running on port ${PORT}`);
});

// API helper to communicate with the compiler backend.

const DEFAULT_API_URL = "http://localhost:5000";

export async function compileDesign(files, runSimulation = true) {
  // Allow overriding backend URL via localStorage for convenience
  const baseUrl = localStorage.getItem("sandronelog_api_url") || DEFAULT_API_URL;
  
  try {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files,
        runSimulation
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Compile API Request Failed:", error);
    throw new Error(error.message || "Failed to reach compiler backend server. Ensure the server is running.");
  }
}

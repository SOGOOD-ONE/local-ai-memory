(() => {
  const API = "http://127.0.0.1:8765/api/health";

  async function checkLocalServer() {
    try {
      const response = await fetch(API, { method: "GET" });
      return await response.json();
    } catch {
      return null;
    }
  }

  // MVP probe only. Context extraction/injection is intentionally isolated
  // from this adapter so site DOM changes do not affect the memory engine.
  window.addEventListener("local-ai-memory:ping", async () => {
    const result = await checkLocalServer();
    window.dispatchEvent(
      new CustomEvent("local-ai-memory:pong", { detail: result }),
    );
  });
})();

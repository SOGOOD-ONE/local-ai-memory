const SERVER = "http://127.0.0.1:8765";

async function api(path, options = {}) {
  const response = await fetch(`${SERVER}${path}`, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === "health") {
    api("/api/health")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "optimizePreview") {
    const body = JSON.stringify({
      query: message.query || "",
      original_context: message.originalContext || "",
      optimized_context: message.optimizedContext || "",
      original_input_tokens: message.originalInputTokens,
      optimized_input_tokens: message.optimizedInputTokens,
      expected_output_tokens: message.expectedOutputTokens,
      cache_hit: Boolean(message.cacheHit),
      local_capable: Boolean(message.localCapable),
      input_per_million: Number(message.inputPerMillion || 0),
      output_per_million: Number(message.outputPerMillion || 0),
    });
    api("/api/optimize/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "recordStats") {
    const body = JSON.stringify({
      platform: message.platform || "unknown",
      decision: message.decision || "cloud",
      original_input_tokens: Number(message.originalInputTokens || 0),
      optimized_input_tokens: Number(message.optimizedInputTokens || 0),
      output_token_budget: Number(message.outputTokenBudget || 0),
      applied: Boolean(message.applied),
    });
    api("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

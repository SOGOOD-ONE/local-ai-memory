(() => {
  const API_BASE = "http://127.0.0.1:8765";
  let lastFingerprint = "";
  let timer = null;

  function fingerprint(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeMessages(messages) {
    return messages
      .map((item) => ({
        role: ["system", "user", "assistant", "tool"].includes(item.role) ? item.role : "unknown",
        content: cleanText(item.content),
      }))
      .filter((item) => item.content);
  }

  async function observe({ platform, messages }) {
    const normalized = normalizeMessages(messages);
    if (!normalized.length) return null;
    const serialized = JSON.stringify(normalized);
    const currentFingerprint = fingerprint(`${platform}|${location.href}|${serialized}`);
    if (currentFingerprint === lastFingerprint) return null;
    lastFingerprint = currentFingerprint;

    const response = await fetch(`${API_BASE}/api/optimize/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        url: location.href,
        messages: normalized,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    window.dispatchEvent(new CustomEvent("local-ai-memory:optimized", { detail: result }));
    return result;
  }

  function debounceObserve(payload, delay = 800) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      observe(payload).catch((error) => {
        console.debug("[Local AI Cost Optimizer] local service unavailable", error);
      });
    }, delay);
  }

  window.LocalAIMemoryAdapter = {
    cleanText,
    normalizeMessages,
    observe,
    debounceObserve,
  };
})();

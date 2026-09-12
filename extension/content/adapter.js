(() => {
  const API_BASE = 'http://127.0.0.1:8765';
  const RECENT_MESSAGE_LIMIT = 7;
  let lastFingerprint = '';
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
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeMessages(messages) {
    return messages
      .map((item) => ({
        role: ['system', 'user', 'assistant', 'tool'].includes(item.role) ? item.role : 'unknown',
        content: cleanText(item.content),
      }))
      .filter((item) => item.content);
  }

  function compressContext(messages) {
    const systemMessages = messages.filter((item) => item.role === 'system');
    const nonSystemMessages = messages.filter((item) => item.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-RECENT_MESSAGE_LIMIT);

    // Preserve all explicit system instructions, then keep the most recent
    // conversational turns. The latest user query is therefore retained while
    // older turns can be removed to reduce prompt size.
    return [...systemMessages, ...recentMessages];
  }

  async function observe({ platform, messages }) {
    const normalized = normalizeMessages(messages);
    const query = [...normalized].reverse().find((item) => item.role === 'user')?.content || '';
    if (!query) return null;

    const optimized = compressContext(normalized);
    const serialized = JSON.stringify({ platform, query, optimized });
    const currentFingerprint = fingerprint(`${location.href}|${serialized}`);
    if (currentFingerprint === lastFingerprint) return null;
    lastFingerprint = currentFingerprint;

    const originalContext = normalized.map((item) => `${item.role}: ${item.content}`).join('\n');
    const optimizedContext = optimized.map((item) => `${item.role}: ${item.content}`).join('\n');
    const response = await fetch(`${API_BASE}/api/optimize/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        original_context: originalContext,
        optimized_context: optimizedContext,
        expected_output_tokens: 512,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const preview = await response.json();
    const result = {
      platform,
      url: location.href,
      query,
      decision: preview.route?.decision || 'cloud',
      cache_hit: Boolean(preview.route?.cache_hit),
      original_input_tokens: preview.cost?.original_input_tokens || 0,
      optimized_input_tokens: preview.cost?.optimized_input_tokens || 0,
      output_token_budget: preview.cost?.output_token_budget || 512,
      optimized_messages: optimized,
      optimized_context: optimizedContext,
      preview,
    };
    window.dispatchEvent(new CustomEvent('local-ai-memory:optimized', { detail: result }));
    return result;
  }

  function debounceObserve(payload, delay = 800) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      observe(payload).catch((error) => {
        console.debug('[Local AI Cost Optimizer] local service unavailable', error);
      });
    }, delay);
  }

  window.LocalAIMemoryAdapter = {
    cleanText,
    normalizeMessages,
    compressContext,
    observe,
    debounceObserve,
  };
})();

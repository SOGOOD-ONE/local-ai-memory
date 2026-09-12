(() => {
  const KEY = '__LOCAL_AI_SEND_BRIDGE__';
  if (window[KEY]) return;

  const state = { enabled: true, lastResult: null };

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function normalize(result) {
    if (!result || typeof result !== 'object') return null;
    return {
      decision: result.decision || result.route?.decision || 'cloud',
      optimized_context: result.optimized_context || '',
      optimized_messages: Array.isArray(result.optimized_messages) ? result.optimized_messages : [],
      input_tokens: Number(result.optimized_input_tokens || result.cost?.optimized_input_tokens || 0),
      original_input_tokens: Number(result.original_input_tokens || result.cost?.original_input_tokens || 0),
      output_token_budget: Number(result.output_token_budget || result.cost?.output_token_budget || 0),
      cache_hit: Boolean(result.cache_hit || result.route?.cache_hit),
    };
  }

  function acceptOptimization(result) {
    const normalized = normalize(result);
    if (!normalized) return;
    state.lastResult = normalized;
    dispatch('local-ai-memory:send-ready', normalized);
  }

  window.LocalAISendBridge = {
    isEnabled: () => state.enabled,
    setEnabled(value) { state.enabled = Boolean(value); },
    acceptOptimization,
    getLastResult: () => state.lastResult,
  };

  window.addEventListener('local-ai-memory:optimized', (event) => {
    if (!state.enabled) return;
    acceptOptimization(event.detail);
  });

  window[KEY] = true;
})();

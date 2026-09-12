(() => {
  const EVENT_READY = 'local-ai-memory:request-context-ready';
  const EVENT_CLEAR = 'local-ai-memory:request-context-clear';
  let panel = null;
  let currentResult = null;

  function buildContext(result) {
    if (!result || typeof result !== 'object') return null;
    const optimizedContext = typeof result.optimized_context === 'string' ? result.optimized_context.trim() : '';
    const query = typeof result.query === 'string' ? result.query.trim() : '';
    if (!query && !optimizedContext) return null;
    return {
      platform: typeof result.platform === 'string' ? result.platform : '',
      url: typeof result.url === 'string' ? result.url : '',
      query,
      optimizedContext,
      originalInputTokens: Number.isFinite(result.original_input_tokens) ? result.original_input_tokens : 0,
      optimizedInputTokens: Number.isFinite(result.optimized_input_tokens) ? result.optimized_input_tokens : 0,
      outputTokenBudget: Number.isFinite(result.output_token_budget) ? result.output_token_budget : 0,
      decision: typeof result.decision === 'string' ? result.decision : '',
      reason: typeof result.reason === 'string' ? result.reason : '',
      cacheHit: Boolean(result.cache_hit)
    };
  }

  function writeContext(context) {
    if (!window.LocalAIRequestContext) return false;
    if (!window.LocalAIRequestContext.write(context)) return false;
    window.dispatchEvent(new CustomEvent(EVENT_READY, { detail: context }));
    return true;
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    currentResult = null;
  }

  function showPanel(result) {
    if (!result?.optimized_context || result.decision === 'cache') return;
    currentResult = result;
    if (!panel) {
      panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;right:24px;bottom:92px;width:310px;z-index:2147483647;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.16);padding:16px;font:14px/1.5 sans-serif;color:#111827';
      document.documentElement.appendChild(panel);
    }
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = '本地优化建议';
    title.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:8px';
    panel.appendChild(title);
    const original = Number(result.original_input_tokens || 0);
    const optimized = Number(result.optimized_input_tokens || 0);
    const info = document.createElement('div');
    info.textContent = `原始 ${original} tokens → 优化后 ${optimized} tokens`;
    info.style.marginBottom = '12px';
    panel.appendChild(info);
    const ignore = document.createElement('button');
    ignore.textContent = '忽略';
    ignore.style.marginRight = '8px';
    ignore.onclick = closePanel;
    panel.appendChild(ignore);
    const apply = document.createElement('button');
    apply.textContent = '应用优化';
    apply.onclick = () => {
      const applied = window.LocalAIMemorySendGuard?.applyOptimization(currentResult) || false;
      if (applied) {
        window.dispatchEvent(new CustomEvent('local-ai-memory:optimization-applied', { detail: currentResult }));
        closePanel();
      }
    };
    panel.appendChild(apply);
  }

  function clear() {
    if (!window.LocalAIRequestContext) return;
    window.LocalAIRequestContext.clear();
    window.dispatchEvent(new CustomEvent(EVENT_CLEAR));
  }

  window.addEventListener('local-ai-memory:optimized', (event) => {
    const context = buildContext(event.detail);
    if (context) {
      writeContext(context);
      showPanel(event.detail);
    }
  });

  window.addEventListener('local-ai-memory:optimization-applied', () => {});

  window.LocalAIRequestContextBridge = Object.freeze({ write: writeContext, clear });
})();

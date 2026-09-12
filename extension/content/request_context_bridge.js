(() => {
  'use strict';

  const EVENT_READY = 'local-ai-memory:request-context-ready';
  const EVENT_CLEAR = 'local-ai-memory:request-context-clear';

  function buildContext(result) {
    if (!result || typeof result !== 'object') return null;

    const optimizedContext =
      typeof result.optimized_context === 'string'
        ? result.optimized_context.trim()
        : '';

    const query =
      typeof result.query === 'string'
        ? result.query.trim()
        : '';

    if (!query && !optimizedContext) return null;

    return {
      platform:
        typeof result.platform === 'string'
          ? result.platform
          : '',
      url:
        typeof result.url === 'string'
          ? result.url
          : '',
      query,
      optimizedContext,
      originalInputTokens:
        Number.isFinite(result.original_input_tokens)
          ? result.original_input_tokens
          : 0,
      optimizedInputTokens:
        Number.isFinite(result.optimized_input_tokens)
          ? result.optimized_input_tokens
          : 0,
      outputTokenBudget:
        Number.isFinite(result.output_token_budget)
          ? result.output_token_budget
          : 0,
      decision:
        typeof result.decision === 'string'
          ? result.decision
          : '',
      reason:
        typeof result.reason === 'string'
          ? result.reason
          : '',
      cacheHit: Boolean(result.cache_hit)
    };
  }

  function publish(result) {
    if (!window.LocalAIRequestContext) return false;

    const context = buildContext(result);
    if (!context) return false;

    const written = window.LocalAIRequestContext.write(context);
    if (!written) return false;

    window.dispatchEvent(
      new CustomEvent(EVENT_READY, {
        detail: context
      })
    );

    return true;
  }

  function clear() {
    if (!window.LocalAIRequestContext) return;

    window.LocalAIRequestContext.clear();

    window.dispatchEvent(
      new CustomEvent(EVENT_CLEAR)
    );
  }

  window.addEventListener(
    'local-ai-memory:optimized',
    (event) => {
      publish(event.detail);
    }
  );

  window.addEventListener(
    'local-ai-memory:optimization-applied',
    () => {
      // Keep the context briefly available for a possible
      // request-layer consumer. The storage TTL handles expiry.
    }
  );

  window.LocalAIRequestContextBridge = Object.freeze({
    publish,
    clear
  });
})();

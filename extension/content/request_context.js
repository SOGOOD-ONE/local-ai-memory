(() => {
  'use strict';

  const STORAGE_KEY = 'local-ai-memory:request-context';
  const TTL_MS = 15_000;

  function sanitize(value) {
    if (!value || typeof value !== 'object') return null;

    const safe = {
      platform: typeof value.platform === 'string'
        ? value.platform.slice(0, 32)
        : '',
      url: typeof value.url === 'string'
        ? value.url.slice(0, 512)
        : '',
      query: typeof value.query === 'string'
        ? value.query.slice(0, 8_000)
        : '',
      optimizedContext: typeof value.optimizedContext === 'string'
        ? value.optimizedContext.slice(0, 20_000)
        : '',
      originalInputTokens: Number.isFinite(value.originalInputTokens)
        ? Math.max(0, Math.floor(value.originalInputTokens))
        : 0,
      optimizedInputTokens: Number.isFinite(value.optimizedInputTokens)
        ? Math.max(0, Math.floor(value.optimizedInputTokens))
        : 0,
      outputTokenBudget: Number.isFinite(value.outputTokenBudget)
        ? Math.max(0, Math.floor(value.outputTokenBudget))
        : 0,
      decision: typeof value.decision === 'string'
        ? value.decision.slice(0, 32)
        : '',
      reason: typeof value.reason === 'string'
        ? value.reason.slice(0, 256)
        : '',
      cacheHit: Boolean(value.cacheHit),
      createdAt: Date.now()
    };

    return safe.query || safe.optimizedContext ? safe : null;
  }

  function write(context) {
    const safe = sanitize(context);
    if (!safe) return false;

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return true;
    } catch (_) {
      return false;
    }
  }

  function read() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const value = JSON.parse(raw);

      if (
        !value ||
        !Number.isFinite(Number(value.createdAt)) ||
        Date.now() - Number(value.createdAt) > TTL_MS
      ) {
        clear();
        return null;
      }

      return sanitize(value);
    } catch (_) {
      clear();
      return null;
    }
  }

  function clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Optional bridge; ignore storage failures.
    }
  }

  window.LocalAIRequestContext = Object.freeze({
    write,
    read,
    clear
  });
})();

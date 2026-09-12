(() => {
  let lastFingerprint = '';
  let timer = null;
  let extensionContextInvalidated = false;

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

  function isExtensionContextValid() {
    try {
      return Boolean(globalThis.chrome?.runtime?.id && chrome.runtime?.sendMessage);
    } catch (_error) {
      return false;
    }
  }

  function isContextInvalidatedError(error) {
    return /extension context invalidated/i.test(String(error?.message || error || ''));
  }

  function sendToServiceWorker(message) {
    return new Promise((resolve, reject) => {
      if (extensionContextInvalidated) {
        reject(new Error('Extension context invalidated'));
        return;
      }

      if (!isExtensionContextValid()) {
        extensionContextInvalidated = true;
        window.clearTimeout(timer);
        reject(new Error('Extension context invalidated'));
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          try {
            if (chrome.runtime.lastError) {
              const messageText = chrome.runtime.lastError.message || 'extension runtime messaging failed';
              if (/extension context invalidated/i.test(messageText)) {
                extensionContextInvalidated = true;
                window.clearTimeout(timer);
              }
              reject(new Error(messageText));
              return;
            }

            if (!response?.ok) {
              reject(new Error(response?.error || 'local service request failed'));
              return;
            }
            resolve(response.data);
          } catch (error) {
            if (isContextInvalidatedError(error)) {
              extensionContextInvalidated = true;
              window.clearTimeout(timer);
            }
            reject(error);
          }
        });
      } catch (error) {
        if (isContextInvalidatedError(error)) {
          extensionContextInvalidated = true;
          window.clearTimeout(timer);
        }
        reject(error);
      }
    });
  }

  async function recordApplied(result) {
    if (!result || extensionContextInvalidated) return;
    try {
      await sendToServiceWorker({
        type: 'recordStats',
        platform: result.platform || 'unknown',
        decision: result.decision || 'cloud',
        originalInputTokens: result.original_input_tokens || 0,
        optimizedInputTokens: result.optimized_input_tokens || 0,
        outputTokenBudget: result.output_token_budget || 0,
        applied: true,
      });
    } catch (error) {
      if (!isContextInvalidatedError(error)) {
        console.debug('[Local AI Cost Optimizer] statistics unavailable', error);
      }
    }
  }

  async function observe({ platform, messages }) {
    if (extensionContextInvalidated) return null;

    const normalized = normalizeMessages(messages);
    const query = [...normalized].reverse().find((item) => item.role === 'user')?.content || '';
    if (!query) return null;

    const systemMessages = normalized.filter((item) => item.role === 'system');
    const recentMessages = normalized.filter((item) => item.role !== 'system').slice(-7);
    const optimized = [...systemMessages, ...recentMessages];
    const serialized = JSON.stringify({ platform, query, optimized });
    const currentFingerprint = fingerprint(`${location.href}|${serialized}`);
    if (currentFingerprint === lastFingerprint) return null;
    lastFingerprint = currentFingerprint;

    const originalContext = normalized.map((item) => `${item.role}: ${item.content}`).join('\n');
    const optimizedContext = optimized.map((item) => `${item.role}: ${item.content}`).join('\n');
    const preview = await sendToServiceWorker({
      type: 'optimizePreview',
      query,
      originalContext,
      optimizedContext,
      expectedOutputTokens: 512,
    });

    const result = {
      platform,
      url: location.href,
      query,
      decision: preview.route?.decision || 'cloud',
      reason: preview.route?.reason || '',
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
    if (extensionContextInvalidated) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      observe(payload).catch((error) => {
        if (isContextInvalidatedError(error)) {
          // The page is holding a stale content-script instance after the extension was reloaded.
          // Do not report this as a local backend outage or spam the console.
          extensionContextInvalidated = true;
          return;
        }
        console.debug('[Local AI Cost Optimizer] local service unavailable', error);
      });
    }, delay);
  }

  window.addEventListener('local-ai-memory:optimization-applied', (event) => {
    recordApplied(event.detail);
  });

  window.LocalAIMemoryAdapter = { cleanText, normalizeMessages, observe, debounceObserve };
})();

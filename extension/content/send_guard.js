(() => {
  const state = {
    enabled: true,
    lastAppliedFingerprint: '',
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function fingerprint(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function findEditable(root = document) {
    const selectors = [
      'textarea',
      '[contenteditable="true"]',
      '[role="textbox"]',
    ];
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function readEditable(node) {
    if (!node) return '';
    return clean('value' in node ? node.value : node.innerText);
  }

  function writeEditable(node, text) {
    if (!node || !text) return false;
    if ('value' in node) {
      const setter = Object.getOwnPropertyDescriptor(node.__proto__, 'value')?.set;
      if (setter) setter.call(node, text);
      else node.value = text;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    node.focus();
    node.textContent = text;
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }

  function buildPrompt(result) {
    if (!result?.optimized_context) return '';
    const query = clean(result.query);
    const context = clean(result.optimized_context);
    if (!query) return context;
    return context.endsWith(query) ? context : `${context}\n\n${query}`;
  }

  function applyOptimization(result) {
    if (!state.enabled || !result) return false;
    const prompt = buildPrompt(result);
    if (!prompt) return false;
    const node = findEditable();
    if (!node) return false;

    const current = readEditable(node);
    if (!current || current !== clean(result.query)) return false;

    const next = prompt;
    const fp = fingerprint(next);
    if (fp === state.lastAppliedFingerprint) return false;
    state.lastAppliedFingerprint = fp;
    return writeEditable(node, next);
  }

  window.LocalAIMemorySendGuard = {
    enable() { state.enabled = true; },
    disable() { state.enabled = false; },
    applyOptimization,
    findEditable,
    readEditable,
  };

  window.addEventListener('local-ai-memory:optimized', (event) => {
    window.dispatchEvent(new CustomEvent('local-ai-memory:optimization-ready', { detail: event.detail }));
  });
})();

(() => {
  const bridge = window.LocalAISendBridge;
  if (!bridge) return;

  function findComposer() {
    const selectors = [
      'textarea[placeholder]',
      'textarea',
      '[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[role="textbox"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function setComposerText(text) {
    const composer = findComposer();
    if (!composer || !text) return false;
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(composer, text); else composer.value = text;
    } else {
      composer.focus();
      composer.textContent = text;
    }
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  window.addEventListener('local-ai-memory:send-ready', (event) => {
    const result = event.detail;
    if (!result || !result.optimized_context || result.decision === 'cache') return;
    window.dispatchEvent(new CustomEvent('local-ai-memory:optimized-context-ready', {
      detail: { platform: 'chatglm', result, canApply: Boolean(findComposer()) },
    }));
  });

  window.LocalAIChatglmSender = { setComposerText, findComposer };
})();

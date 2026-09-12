(() => {
  const bridge = window.LocalAISendBridge;
  if (!bridge) return;

  function findComposer() {
    return document.querySelector('textarea[placeholder], textarea')
      || document.querySelector('[contenteditable="true"]');
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
      detail: { platform: 'doubao', result, canApply: Boolean(findComposer()) },
    }));
  });

  window.LocalAIDoubaoSender = { setComposerText, findComposer };
})();

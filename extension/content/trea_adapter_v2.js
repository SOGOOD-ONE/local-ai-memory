(() => {
  const adapter = window.LocalAIMemoryAdapter;
  if (!adapter) return;

  function extractVisibleConversation() {
    const nodes = Array.from(document.querySelectorAll(
      'main [data-message-role], main [data-message-author-role], main [data-testid*="message"], main article'
    ));
    return nodes.map((node) => {
      const explicitRole = node.getAttribute('data-message-role') || node.getAttribute('data-message-author-role');
      const label = (node.getAttribute('aria-label') || '').toLowerCase();
      const role = explicitRole || (label.includes('user') ? 'user' : 'assistant');
      return { role, content: node.innerText };
    });
  }

  function sendSnapshot() {
    adapter.debounceObserve({ platform: 'trea', messages: extractVisibleConversation() });
  }

  const observer = new MutationObserver(sendSnapshot);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.setTimeout(sendSnapshot, 1200);
  window.addEventListener('local-ai-memory:refresh', sendSnapshot);
})();

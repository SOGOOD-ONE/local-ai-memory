(() => {
  const adapter = window.LocalAIMemoryAdapter;
  if (!adapter) return;

  function extractVisibleConversation() {
    const nodes = Array.from(document.querySelectorAll('main [data-message-author-role], main article'));
    return nodes.map((node) => ({
      role: node.getAttribute('data-message-author-role') || 'assistant',
      content: node.innerText,
    }));
  }

  function sendSnapshot() {
    const messages = extractVisibleConversation();
    const query = [...messages].reverse().find((item) => item.role === 'user')?.content || '';
    if (!query) return;

    // Keep the full visible conversation here. The shared adapter performs the
    // intentional last-8-message context reduction and can therefore measure
    // the real before/after token difference.
    adapter.debounceObserve({ platform: 'chatgpt', messages });
  }

  const observer = new MutationObserver(sendSnapshot);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.setTimeout(sendSnapshot, 1200);
  window.addEventListener('local-ai-memory:refresh', sendSnapshot);
})();

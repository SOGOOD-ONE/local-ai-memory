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

  function getComposerText() {
    const node = document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]')
      || document.querySelector('[role="textbox"]');
    if (!node) return '';
    return String('value' in node ? node.value : node.innerText || '').trim();
  }

  function sendSnapshot() {
    const messages = extractVisibleConversation();
    const composer = getComposerText();
    const lastUser = [...messages].reverse().find((item) => item.role === 'user')?.content || '';
    if (composer && composer !== lastUser) {
      messages.push({ role: 'user', content: composer });
    }
    const query = [...messages].reverse().find((item) => item.role === 'user')?.content || '';
    if (!query) return;
    adapter.debounceObserve({ platform: 'chatgpt', messages });
  }

  const observer = new MutationObserver(sendSnapshot);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.setTimeout(sendSnapshot, 1200);
  window.addEventListener('local-ai-memory:refresh', sendSnapshot);
})();

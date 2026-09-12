(() => {
  const adapter = window.LocalAIMemoryAdapter;
  if (!adapter) return;

  function clean(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function roleOf(node) {
    const explicit = node.getAttribute('data-message-author-role');
    if (explicit) return explicit;

    const testId = node.getAttribute('data-testid') || '';
    if (/user/i.test(testId)) return 'user';
    if (/assistant/i.test(testId)) return 'assistant';

    const articleRole = node.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
    if (articleRole) return articleRole;

    return '';
  }

  function contentOf(node) {
    const direct = clean(node.innerText || node.textContent || '');
    if (direct) return direct;
    return '';
  }

  function extractVisibleConversation() {
    const candidates = Array.from(document.querySelectorAll(
      'main [data-message-author-role], main article[data-testid], main article'
    ));

    const messages = [];
    const seen = new Set();

    for (const node of candidates) {
      // Avoid counting an article and its nested message node twice.
      if (node.querySelector('[data-message-author-role]') && !node.hasAttribute('data-message-author-role')) {
        continue;
      }

      const role = roleOf(node);
      const content = contentOf(node);
      if (!['user', 'assistant', 'system', 'tool'].includes(role) || !content) continue;

      const key = `${role}:${content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push({ role, content });
    }

    return messages;
  }

  function getComposerText() {
    const selectors = [
      'textarea:not([disabled])',
      '[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[role="textbox"]',
    ];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes.reverse()) {
        if (!node.isConnected) continue;
        const value = 'value' in node ? node.value : node.innerText || node.textContent || '';
        const text = clean(value);
        if (text) return text;
      }
    }
    return '';
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

    // The adapter performs token estimation from the actual extracted text.
    // Keeping the full message snapshot here prevents the optimizer from receiving
    // an empty context when ChatGPT's DOM structure changes.
    adapter.debounceObserve({ platform: 'chatgpt', messages });
  }

  let scheduled = false;
  function scheduleSnapshot() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      sendSnapshot();
    }, 250);
  }

  const observer = new MutationObserver(scheduleSnapshot);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  window.setTimeout(sendSnapshot, 1200);
  window.addEventListener('local-ai-memory:refresh', sendSnapshot);
})();

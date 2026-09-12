(() => {
  const adapter = window.LocalAIMemoryAdapter;
  if (!adapter) return;

  function clean(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function roleOf(node) {
    const attrs = ['data-message-role', 'data-message-author-role', 'data-role', 'data-testid'];
    for (const attr of attrs) {
      const val = node.getAttribute(attr);
      if (!val) continue;
      const lower = val.toLowerCase();
      if (/(user|human|我|用户)/.test(lower)) return 'user';
      if (/(assistant|ai|model|bot|助手|模型|豆包)/.test(lower)) return 'assistant';
      if (/(system)/.test(lower)) return 'system';
      if (/(tool|function)/.test(lower)) return 'tool';
    }
    const aria = (node.getAttribute('aria-label') || '').toLowerCase();
    if (/用户|user|我/.test(aria)) return 'user';
    if (/助手|assistant|豆包|模型|ai/.test(aria)) return 'assistant';
    // 豆包按布局区分角色：用户消息右对齐（justify-end），助手消息为网格布局
    const cls = (node.className || '').toString().toLowerCase();
    if (cls.includes('justify-end')) return 'user';
    if (cls.includes('grid-cols-')) return 'assistant';
    if (/(user|human|mine)/.test(cls)) return 'user';
    if (/(assistant|ai|bot|model)/.test(cls)) return 'assistant';
    return '';
  }

  function contentOf(node) {
    return clean(node.innerText || node.textContent || '');
  }

  function extractVisibleConversation() {
    const selectors = [
      // 豆包真实会话的消息容器锚点（每轮对话一个），优先使用
      '[data-message-id]',
      'main [data-message-role]',
      'main [data-message-author-role]',
      'main [data-role]',
      'main [data-testid*="message"]',
      'main article',
      'main [class*="message"]',
      'main [class*="Message"]',
      '[class*="message-item"]',
      '[class*="chat-item"]',
    ];

    const seen = new Set();
    const messages = [];

    for (const selector of selectors) {
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(selector)); } catch { continue; }
      for (const node of nodes) {
        if (node.querySelector('[data-message-role], [data-message-author-role], [data-role]')) {
          const hasOwn = node.hasAttribute('data-message-role') ||
            node.hasAttribute('data-message-author-role') ||
            node.getAttribute('data-role');
          if (!hasOwn) continue;
        }
        const role = roleOf(node);
        const content = contentOf(node);
        if (!['user', 'assistant', 'system', 'tool'].includes(role) || !content) continue;
        const key = `${role}:${content.slice(0, 200)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push({ role, content });
      }
    }
    return messages;
  }

  function getComposerText() {
    const selectors = [
      'textarea:not([disabled])',
      '[contenteditable="true"]:not([disabled])',
      '[role="textbox"][contenteditable="true"]',
      '[role="textbox"]',
      '[contenteditable="plaintext-only"]',
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
    adapter.debounceObserve({ platform: 'doubao', messages });
  }

  let scheduled = false;
  function scheduleSnapshot() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => { scheduled = false; sendSnapshot(); }, 250);
  }

  const observer = new MutationObserver(scheduleSnapshot);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.setTimeout(sendSnapshot, 1200);
  window.addEventListener('local-ai-memory:refresh', sendSnapshot);
})();

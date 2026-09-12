(() => {
  const adapter = window.LocalAIMemoryAdapter;
  if (!adapter) return;

  function clean(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // DeepSeek 消息角色识别：优先 data 属性，其次 aria-label，最后 class 推断
  function roleOf(node) {
    const attrs = [
      'data-message-author-role',
      'data-message-role',
      'data-role',
      'data-testid',
    ];
    for (const attr of attrs) {
      const val = node.getAttribute(attr);
      if (!val) continue;
      const lower = val.toLowerCase();
      if (/(user|human|我|用户)/.test(lower)) return 'user';
      if (/(assistant|ai|model|bot|助手|模型)/.test(lower)) return 'assistant';
      if (/(system)/.test(lower)) return 'system';
      if (/(tool|function)/.test(lower)) return 'tool';
    }

    const aria = (node.getAttribute('aria-label') || '').toLowerCase();
    if (/用户|user|我/.test(aria)) return 'user';
    if (/助手|assistant|deepseek|模型|ai/.test(aria)) return 'assistant';

    // class 兜底
    const cls = (node.className || '').toString().toLowerCase();
    if (/(user|human|mine)/.test(cls)) return 'user';
    if (/(assistant|ai|bot|model|deepseek)/.test(cls)) return 'assistant';

    return '';
  }

  function contentOf(node) {
    return clean(node.innerText || node.textContent || '');
  }

  // 多通道选择器，按优先级尝试
  function extractVisibleConversation() {
    const selectors = [
      '[data-message-author-role]',
      '[data-message-role]',
      '[data-role="user"], [data-role="assistant"]',
      'main [data-testid*="message"]',
      'main article',
      'main [class*="message"]',
      'main [class*="Message"]',
      'main [class*="chat-item"]',
      'main [class*="ChatItem"]',
      '[class*="message-item"]',
      '[class*="messageItem"]',
    ];

    const seen = new Set();
    const messages = [];

    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(selector));
      } catch {
        continue;
      }

      for (const node of nodes) {
        // 跳过包含子消息节点的容器，避免重复
        if (node.querySelector('[data-message-author-role], [data-message-role], [data-role]')) {
          if (!node.hasAttribute('data-message-author-role') &&
              !node.hasAttribute('data-message-role') &&
              !node.getAttribute('data-role')) continue;
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

    adapter.debounceObserve({ platform: 'deepseek', messages });
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

(() => {
  const API_BASE = 'http://127.0.0.1:8765';

  function extractVisibleConversation() {
    const nodes = Array.from(document.querySelectorAll('main [data-message-author-role], main article, main [role="article"]'));
    return nodes
      .map((node) => ({ role: node.getAttribute('data-message-author-role') || 'unknown', content: node.innerText.trim() }))
      .filter((item) => item.content);
  }

  async function sendSnapshot() {
    try {
      await fetch(`${API_BASE}/api/context/observe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'doubao',
          url: location.href,
          messages: extractVisibleConversation(),
          observed_at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.debug('[Local AI Memory] Doubao local service unavailable', error);
    }
  }

  const observer = new MutationObserver(() => sendSnapshot());
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.setTimeout(sendSnapshot, 1500);
})();

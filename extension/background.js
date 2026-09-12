const SERVER = "http://127.0.0.1:8765";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "health") return;

  fetch(`${SERVER}/api/health`)
    .then((response) => response.json())
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});

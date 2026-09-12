const status = document.getElementById("serverBadge");
const check = document.getElementById("check");
const platform = document.getElementById("platform");

function detectPlatform(url) {
  const host = new URL(url).hostname;
  if (host.includes("chatgpt") || host.includes("openai")) return "ChatGPT";
  if (host.includes("doubao")) return "豆包";
  if (host.includes("trae")) return "Trea";
  return "当前标签页";
}

async function checkServer() {
  status.textContent = "检查中";
  status.className = "badge";
  try {
    const response = await fetch("http://127.0.0.1:8765/api/health");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    status.textContent = data.status === "ok" ? "本地服务在线" : "服务异常";
    status.classList.add(data.status === "ok" ? "online" : "offline");
  } catch {
    status.textContent = "本地服务离线";
    status.classList.add("offline");
  }
}

async function loadTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  platform.textContent = tab?.url ? detectPlatform(tab.url) : "未知";
}

check.addEventListener("click", checkServer);
loadTab();
checkServer();

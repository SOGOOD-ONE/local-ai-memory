const status = document.getElementById("serverBadge");
const check = document.getElementById("check");
const platform = document.getElementById("platform");
const savedInput = document.getElementById("savedInput");
const savedOutput = document.getElementById("savedOutput");
const savedCost = document.getElementById("savedCost");
const decision = document.getElementById("decision");
const reason = document.getElementById("reason");

const API_BASE = typeof window !== "undefined" && window.location.protocol.startsWith("http")
  ? ""
  : "http://127.0.0.1:8765";

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("chatgpt") || host.includes("openai")) return "ChatGPT";
    if (host.includes("doubao")) return "豆包";
    if (host.includes("trae") || host.includes("trea")) return "Trea";
  } catch {}
  return "当前标签页";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    savedInput.textContent = formatNumber(data.saved_input_tokens);
    savedOutput.textContent = formatNumber(data.output_token_budget);
    savedCost.textContent = `${Number(data.input_saving_ratio || 0).toFixed(2)}%`;
    if (data.requests) {
      decision.textContent = `已处理 ${formatNumber(data.requests)} 次请求`;
      reason.textContent = `实际应用 ${formatNumber(data.applied_requests)} 次，输入 token 节省 ${Number(data.input_saving_ratio || 0).toFixed(2)}%。`;
    }
  } catch {
    decision.textContent = "等待统计数据";
    reason.textContent = "本地服务在线后，这里会显示累计优化效果。";
  }
}

async function checkServer() {
  status.textContent = "检查中";
  status.className = "badge";
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    status.textContent = data.status === "ok" ? "本地服务在线" : "服务异常";
    status.classList.add(data.status === "ok" ? "online" : "offline");
    if (data.status === "ok") await loadStats();
  } catch {
    status.textContent = "本地服务离线";
    status.classList.add("offline");
  }
}

async function loadTab() {
  if (typeof chrome !== "undefined" && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      platform.textContent = tab?.url ? detectPlatform(tab.url) : "未知";
      return;
    } catch {}
  }
  platform.textContent = "ChatGPT (模拟)";
}

check.addEventListener("click", checkServer);
loadTab();
checkServer();


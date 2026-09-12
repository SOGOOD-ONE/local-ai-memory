const status = document.getElementById("status");
const check = document.getElementById("check");

async function checkServer() {
  status.textContent = "检查本地服务中…";
  try {
    const response = await fetch("http://127.0.0.1:8765/api/health");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    status.textContent = data.status === "ok" ? "本地服务已连接" : "服务状态异常";
  } catch (error) {
    status.textContent = "未连接本地服务（请先启动 Flask）";
  }
}

check.addEventListener("click", checkServer);
checkServer();

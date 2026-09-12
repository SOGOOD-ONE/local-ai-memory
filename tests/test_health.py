import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "backend" / "app.py"
spec = importlib.util.spec_from_file_location("local_ai_memory_app", APP_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_health():
    client = module.app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {
        "status": "ok",
        "service": "local-ai-memory",
    }

from __future__ import annotations

from flask import Flask, jsonify, request

from api_optimizer import build_optimization_preview
from context_engine import ContextPolicy, build_context as build_context_engine
from cost_engine import ModelPricing
from database import add_memory, add_message, init_db, list_memories, list_messages, upsert_session
from memory_lifecycle import MemoryPolicy, rollup_session
from token_engine import estimate_messages, estimate_tokens

app = Flask(__name__)
init_db()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "local-ai-memory", "version": "0.5.0"})


@app.post("/api/session")
def create_session():
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("session_id", "")).strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400
    platform = str(data.get("platform", "unknown"))
    title = data.get("title")
    upsert_session(session_id, platform, title)
    return jsonify({"status": "ok", "session_id": session_id})


@app.post("/api/message")
def create_message():
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("session_id", "")).strip()
    role = str(data.get("role", "")).strip()
    content = str(data.get("content", ""))
    if not session_id or role not in {"system", "user", "assistant", "tool"} or not content:
        return jsonify({"error": "session_id, valid role and content are required"}), 400
    upsert_session(session_id, str(data.get("platform", "unknown")))
    token_count = estimate_tokens(content)
    message_id = add_message(session_id, role, content, token_count)
    return jsonify({"status": "ok", "message_id": message_id, "token_count": token_count})


@app.get("/api/session/<session_id>/messages")
def get_messages(session_id: str):
    try:
        limit = int(request.args.get("limit", "50"))
    except ValueError:
        limit = 50
    messages = list_messages(session_id, limit)
    return jsonify({"session_id": session_id, "messages": messages})


@app.post("/api/memory")
def create_memory():
    data = request.get_json(silent=True) or {}
    content = str(data.get("content", "")).strip()
    memory_type = str(data.get("memory_type", "long"))
    if not content or memory_type not in {"short", "medium", "long"}:
        return jsonify({"error": "content and valid memory_type are required"}), 400
    memory_id = add_memory(
        content,
        memory_type=memory_type,
        session_id=data.get("session_id"),
        importance=float(data.get("importance", 0.5)),
        metadata=data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
    )
    return jsonify({"status": "ok", "memory_id": memory_id})


@app.get("/api/memories")
def get_memories():
    memory_type = request.args.get("type") or None
    try:
        limit = int(request.args.get("limit", "20"))
    except ValueError:
        limit = 20
    return jsonify({"memories": list_memories(memory_type, limit)})


@app.post("/api/session/<session_id>/rollup")
def rollup_memory(session_id: str):
    data = request.get_json(silent=True) or {}

    def integer(name: str, default: int, lower: int, upper: int) -> int:
        try:
            value = int(data.get(name, default))
        except (TypeError, ValueError):
            value = default
        return max(lower, min(value, upper))

    try:
        min_importance = float(data.get("min_long_importance", 0.75))
    except (TypeError, ValueError):
        min_importance = 0.75

    policy = MemoryPolicy(
        short_window=integer("short_window", 8, 1, 50),
        medium_trigger_messages=integer("medium_trigger_messages", 20, 5, 500),
        medium_summary_window=integer("medium_summary_window", 20, 5, 100),
        min_long_importance=max(0.0, min(min_importance, 1.0)),
    )
    return jsonify(rollup_session(session_id, policy))


@app.post("/api/context/build")
def build_context():
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("session_id", "")).strip()
    query = str(data.get("query", "")).strip()
    if not session_id or not query:
        return jsonify({"error": "session_id and query are required"}), 400

    def integer(name: str, default: int, lower: int, upper: int) -> int:
        try:
            value = int(data.get(name, default))
        except (TypeError, ValueError):
            value = default
        return max(lower, min(value, upper))

    try:
        min_score = float(data.get("min_retrieval_score", 0.0))
    except (TypeError, ValueError):
        min_score = 0.0

    policy = ContextPolicy(
        recent_messages=integer("recent_limit", 8, 1, 50),
        recalled_memories=integer("memory_limit", 5, 1, 50),
        max_context_tokens=integer("max_context_tokens", 6000, 256, 32000),
        min_retrieval_score=max(0.0, min(min_score, 1.0)),
    )
    return jsonify(build_context_engine(session_id, query, policy))


@app.post("/api/optimize/preview")
def optimize_preview():
    data = request.get_json(silent=True) or {}
    query = str(data.get("query", "")).strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    try:
        original_input = int(data.get("original_input_tokens", estimate_tokens(str(data.get("original_context", "")))))
        optimized_input = int(data.get("optimized_input_tokens", estimate_tokens(str(data.get("optimized_context", "")))))
        input_price = float(data.get("input_per_million", 0.0))
        output_price = float(data.get("output_per_million", 0.0))
        expected_output = data.get("expected_output_tokens")
        expected_output = int(expected_output) if expected_output is not None else None
    except (TypeError, ValueError):
        return jsonify({"error": "invalid numeric optimization parameters"}), 400

    result = build_optimization_preview(
        query,
        max(0, original_input),
        max(0, optimized_input),
        cache_hit=bool(data.get("cache_hit", False)),
        local_capable=bool(data.get("local_capable", False)),
        expected_output_tokens=expected_output,
        pricing=ModelPricing(input_price, output_price),
    )
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8765, debug=True)

from __future__ import annotations

from flask import Flask, jsonify, request

from database import add_memory, add_message, init_db, list_memories, list_messages, upsert_session
from token_engine import compression_stats, estimate_messages, estimate_tokens

app = Flask(__name__)
init_db()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "local-ai-memory", "version": "0.2.0"})


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


@app.post("/api/context/build")
def build_context():
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("session_id", "")).strip()
    query = str(data.get("query", "")).strip()
    recent_limit = int(data.get("recent_limit", 8))
    memory_limit = int(data.get("memory_limit", 5))
    if not session_id or not query:
        return jsonify({"error": "session_id and query are required"}), 400

    recent_messages = list_messages(session_id, max(1, min(recent_limit, 50)))
    memories = list_memories(limit=max(1, min(memory_limit, 20)))

    original_messages = [{"role": item["role"], "content": item["content"]} for item in recent_messages]
    memory_text = "\n".join(f"- {item['content']}" for item in memories)
    compressed_messages = []
    if memory_text:
        compressed_messages.append({
            "role": "system",
            "content": "Relevant local memories:\n" + memory_text,
        })
    compressed_messages.extend(original_messages)
    compressed_messages.append({"role": "user", "content": query})

    original_tokens = estimate_messages(original_messages) + estimate_tokens(query)
    compressed_tokens = estimate_messages(compressed_messages)
    return jsonify({
        "session_id": session_id,
        "query": query,
        "messages": compressed_messages,
        "stats": compression_stats(original_tokens, compressed_tokens),
        "memory_count": len(memories),
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8765, debug=True)

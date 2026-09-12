from flask import Flask, jsonify, request

app = Flask(__name__)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "local-ai-memory"})


@app.post("/api/context/observe")
def observe_context():
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages") or []
    return jsonify({
        "status": "ok",
        "platform": payload.get("platform", "unknown"),
        "message_count": len(messages),
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8765, debug=True)

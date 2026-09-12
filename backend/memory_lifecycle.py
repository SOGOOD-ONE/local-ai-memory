from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from database import add_memory, list_messages


@dataclass(frozen=True)
class MemoryPolicy:
    short_window: int = 8
    medium_trigger_messages: int = 20
    medium_summary_window: int = 20
    min_long_importance: float = 0.75


def score_message_importance(role: str, content: str) -> float:
    text = content.strip().lower()
    score = 0.2
    if role == "user":
        score += 0.2
    if any(marker in text for marker in ("记住", "以后", "我的", "项目", "不要", "需要", "prefer", "always", "never")):
        score += 0.35
    if len(content) > 120:
        score += 0.1
    return min(score, 1.0)


def build_local_summary(messages: list[dict[str, Any]]) -> str:
    """Deterministic MVP summary; replaceable by a local LLM later."""
    lines: list[str] = []
    for message in messages:
        content = str(message.get("content", "")).strip().replace("\n", " ")
        if not content:
            continue
        role = str(message.get("role", "unknown"))
        snippet = content if len(content) <= 180 else content[:177] + "..."
        lines.append(f"{role}: {snippet}")
    return "\n".join(lines)


def rollup_session(session_id: str, policy: MemoryPolicy | None = None) -> dict[str, Any]:
    policy = policy or MemoryPolicy()
    all_messages = list_messages(session_id, limit=500)
    if not all_messages:
        return {"session_id": session_id, "status": "empty", "created": 0}

    created = 0
    medium_summary = None
    if len(all_messages) >= policy.medium_trigger_messages:
        medium_messages = all_messages[-policy.medium_summary_window :]
        medium_summary = build_local_summary(medium_messages)
        if medium_summary:
            add_memory(
                medium_summary,
                memory_type="medium",
                session_id=session_id,
                importance=0.65,
                metadata={"source": "memory_lifecycle", "message_count": len(medium_messages)},
            )
            created += 1

    for message in all_messages[-policy.short_window :]:
        importance = score_message_importance(message["role"], message["content"])
        if importance >= policy.min_long_importance:
            add_memory(
                message["content"],
                memory_type="long",
                session_id=session_id,
                importance=importance,
                metadata={"source": "message", "message_id": message["id"], "role": message["role"]},
            )
            created += 1

    return {
        "session_id": session_id,
        "status": "ok",
        "created": created,
        "medium_summary_created": bool(medium_summary),
    }

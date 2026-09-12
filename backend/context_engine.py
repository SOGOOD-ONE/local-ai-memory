from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from database import list_messages
from retrieval import retrieve
from token_engine import compression_stats, estimate_messages, estimate_tokens


@dataclass(frozen=True)
class ContextPolicy:
    recent_messages: int = 8
    recalled_memories: int = 5
    max_context_tokens: int = 6000
    min_retrieval_score: float = 0.0


def _message(role: str, content: str) -> dict[str, str]:
    return {"role": role, "content": content}


def build_context(
    session_id: str,
    query: str,
    policy: ContextPolicy | None = None,
) -> dict[str, Any]:
    policy = policy or ContextPolicy()
    recent = list_messages(session_id, max(1, min(policy.recent_messages, 50)))
    memories = [
        item for item in retrieve(query, policy.recalled_memories)
        if item.get("retrieval_score", 0.0) >= policy.min_retrieval_score
    ]

    original_messages = [
        _message(item["role"], item["content"])
        for item in recent
    ]
    original_tokens = estimate_messages(original_messages) + estimate_tokens(query)

    selected_memories: list[dict[str, Any]] = []
    memory_messages: list[dict[str, str]] = []
    memory_budget = max(0, policy.max_context_tokens - estimate_tokens(query))
    used_memory_tokens = 0

    for memory in memories:
        text = str(memory["content"]).strip()
        memory_tokens = estimate_tokens(text)
        if used_memory_tokens + memory_tokens > memory_budget and selected_memories:
            continue
        selected_memories.append(memory)
        used_memory_tokens += memory_tokens
        memory_messages.append(_message("system", f"Relevant local memory: {text}"))
        if len(selected_memories) >= policy.recalled_memories:
            break

    compressed: list[dict[str, str]] = []
    compressed.extend(memory_messages)

    recent_budget = max(1, policy.max_context_tokens - estimate_messages(memory_messages) - estimate_tokens(query))
    running = 0
    for message in reversed(original_messages):
        cost = estimate_tokens(message["content"])
        if running + cost > recent_budget and compressed:
            break
        compressed.insert(len(memory_messages), message)
        running += cost

    compressed.append(_message("user", query))
    compressed_tokens = estimate_messages(compressed)

    return {
        "session_id": session_id,
        "query": query,
        "messages": compressed,
        "memories": [
            {
                "id": item["id"],
                "memory_type": item["memory_type"],
                "importance": item["importance"],
                "retrieval_score": item.get("retrieval_score", 0.0),
                "content": item["content"],
            }
            for item in selected_memories
        ],
        "policy": {
            "recent_messages": policy.recent_messages,
            "recalled_memories": policy.recalled_memories,
            "max_context_tokens": policy.max_context_tokens,
            "min_retrieval_score": policy.min_retrieval_score,
        },
        "stats": compression_stats(original_tokens, compressed_tokens),
    }

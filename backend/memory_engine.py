from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from database import add_memory, list_memories


STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on",
    "for", "with", "this", "that", "it", "as", "at", "by", "be", "from", "about", "我", "你", "他", "她",
    "的", "了", "是", "在", "和", "与", "或", "也", "就", "都", "而", "一个", "我们", "你们", "他们",
}


def _terms(text: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9_'-]+|[\u3400-\u9fff]", text.lower())
    return [t for t in tokens if t not in STOPWORDS and len(t.strip()) > 0]


def lexical_similarity(query: str, content: str) -> float:
    q = Counter(_terms(query))
    c = Counter(_terms(content))
    if not q or not c:
        return 0.0
    common = sum(min(q[token], c[token]) for token in q.keys() & c.keys())
    q_norm = math.sqrt(sum(v * v for v in q.values()))
    c_norm = math.sqrt(sum(v * v for v in c.values()))
    return round(common / (q_norm * c_norm), 6) if q_norm and c_norm else 0.0


def rank_memories(query: str, memories: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    ranked = []
    for memory in memories:
        lexical = lexical_similarity(query, memory.get("content", ""))
        importance = max(0.0, min(float(memory.get("importance", 0.5)), 1.0))
        type_weight = {"long": 1.0, "medium": 0.9, "short": 0.75}.get(memory.get("memory_type"), 0.8)
        score = lexical * 0.75 + importance * 0.2 + type_weight * 0.05
        ranked.append({**memory, "retrieval_score": round(score, 6)})
    ranked.sort(key=lambda item: item["retrieval_score"], reverse=True)
    return ranked[: max(1, min(int(limit), 50))]


def retrieve_memories(query: str, limit: int = 5) -> list[dict[str, Any]]:
    return rank_memories(query, list_memories(limit=200), limit)


def remember(content: str, memory_type: str = "long", importance: float = 0.6, metadata: dict[str, Any] | None = None) -> int:
    return add_memory(content.strip(), memory_type=memory_type, importance=importance, metadata=metadata)

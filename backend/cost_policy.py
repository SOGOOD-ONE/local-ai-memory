from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OutputBudget:
    max_tokens: int
    reason: str


def recommend_output_budget(query: str) -> OutputBudget:
    text = (query or "").strip()
    length = len(text)
    if length <= 30:
        return OutputBudget(384, "short question")
    if length <= 100:
        return OutputBudget(768, "normal question")
    if length <= 300:
        return OutputBudget(1536, "detailed question")
    return OutputBudget(2048, "long/complex question")

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from cache_store import find_cache
from cost_engine import ModelPricing, estimate_cost
from token_engine import estimate_tokens


@dataclass(frozen=True)
class OptimizationDecision:
    mode: str
    reason: str
    max_output_tokens: int
    cache_hit: bool
    cache_entry: dict[str, Any] | None = None


def classify_local_capability(query: str) -> bool:
    text = (query or "").strip().lower()
    if not text:
        return False
    # Conservative fast path: deterministic, low-risk utility requests only.
    prefixes = (
        "1+1", "2+2", "3+3", "what time", "today's date", "今天是几号", "现在几点",
        "翻译", "translate", "提取邮箱", "extract email",
    )
    return len(text) <= 80 and text.startswith(prefixes)


def plan_output_tokens(query: str, base: int = 800) -> int:
    length = len(query.strip())
    if length <= 40:
        return min(base, 400)
    if length <= 160:
        return min(base, 800)
    return min(max(base, 1200), 2000)


def decide(
    query: str,
    platform: str = "unknown",
    model: str | None = None,
    session_scope: str = "global",
    cache_threshold: float = 0.92,
) -> OptimizationDecision:
    if classify_local_capability(query):
        return OptimizationDecision(
            mode="local",
            reason="deterministic_low_risk_fast_path",
            max_output_tokens=0,
            cache_hit=False,
        )
    entry = find_cache(
        query,
        platform=platform,
        model=model,
        session_scope=session_scope,
        threshold=cache_threshold,
    )
    if entry is not None:
        return OptimizationDecision(
            mode="cache",
            reason="semantic_cache_hit",
            max_output_tokens=0,
            cache_hit=True,
            cache_entry=entry,
        )
    return OptimizationDecision(
        mode="cloud",
        reason="no_safe_local_path_or_cache_hit",
        max_output_tokens=plan_output_tokens(query),
        cache_hit=False,
    )


def preview_cost(
    original_input_tokens: int,
    optimized_input_tokens: int,
    planned_output_tokens: int,
    pricing: ModelPricing,
    decision: OptimizationDecision,
) -> dict[str, Any]:
    original = estimate_cost(original_input_tokens, planned_output_tokens, pricing)
    if decision.mode in {"local", "cache"}:
        optimized = estimate_cost(0, 0, pricing)
    else:
        optimized = estimate_cost(optimized_input_tokens, planned_output_tokens, pricing)
    return {
        "decision": decision.mode,
        "reason": decision.reason,
        "max_output_tokens": decision.max_output_tokens,
        "cache_hit": decision.cache_hit,
        "before": original,
        "after": optimized,
        "saved_cost": round(max(0.0, original["total_cost"] - optimized["total_cost"]), 8),
        "saved_input_tokens": max(0, int(original_input_tokens) - (0 if decision.mode in {"local", "cache"} else int(optimized_input_tokens))),
        "saved_output_tokens": max(0, int(planned_output_tokens) - (0 if decision.mode in {"local", "cache"} else int(planned_output_tokens))),
    }

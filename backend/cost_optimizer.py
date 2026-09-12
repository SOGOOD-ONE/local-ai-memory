from __future__ import annotations

from dataclasses import dataclass

from cost_engine import ModelPricing, estimate_cost


@dataclass(frozen=True)
class OptimizationPolicy:
    default_output_tokens: int = 800
    simple_output_tokens: int = 300
    complex_output_tokens: int = 1600
    simple_query_max_chars: int = 80
    cache_similarity_threshold: float = 0.92


def classify_query(query: str) -> str:
    text = " ".join(str(query).split())
    if len(text) <= 0:
        return "empty"
    if len(text) <= 80 and any(marker in text for marker in ("多少", "等于", "翻译", "解释", "是什么", "怎么写")):
        return "simple"
    if len(text) > 500 or any(marker in text for marker in ("设计", "分析", "论文", "架构", "详细", "比较")):
        return "complex"
    return "normal"


def output_budget(query: str, policy: OptimizationPolicy = OptimizationPolicy()) -> dict:
    kind = classify_query(query)
    budget = {
        "empty": policy.default_output_tokens,
        "simple": policy.simple_output_tokens,
        "normal": policy.default_output_tokens,
        "complex": policy.complex_output_tokens,
    }[kind]
    return {"query_type": kind, "max_output_tokens": budget}


def optimization_preview(
    original_input_tokens: int,
    query: str,
    optimized_input_tokens: int,
    pricing: ModelPricing,
    expected_output_tokens: int | None = None,
    policy: OptimizationPolicy = OptimizationPolicy(),
) -> dict:
    budget = output_budget(query, policy)
    output_tokens = min(expected_output_tokens or budget["max_output_tokens"], budget["max_output_tokens"])
    before = estimate_cost(original_input_tokens, expected_output_tokens or output_tokens, pricing)
    after = estimate_cost(optimized_input_tokens, output_tokens, pricing)
    return {
        "query_type": budget["query_type"],
        "max_output_tokens": budget["max_output_tokens"],
        "planned_output_tokens": output_tokens,
        "before": before,
        "after": after,
        "saved_cost": round(max(0.0, before["total_cost"] - after["total_cost"]), 8),
    }

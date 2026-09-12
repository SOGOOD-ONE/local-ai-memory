from __future__ import annotations

from dataclasses import dataclass

from cost_optimizer import OptimizationPolicy, classify_query, output_budget
from retrieval import retrieve


@dataclass(frozen=True)
class RouteDecision:
    action: str
    reason: str
    query_type: str
    cache_threshold: float


def decide_route(query: str, cache_hit: bool = False, local_capable: bool = False, policy: OptimizationPolicy = OptimizationPolicy()) -> dict:
    query_type = classify_query(query)
    if not str(query).strip():
        return RouteDecision("reject", "empty query", "empty", policy.cache_similarity_threshold).__dict__
    if local_capable:
        return RouteDecision("local", "task is eligible for local fast path", query_type, policy.cache_similarity_threshold).__dict__
    if cache_hit:
        return RouteDecision("cache", "semantic cache hit", query_type, policy.cache_similarity_threshold).__dict__
    return RouteDecision("cloud", "cloud model required", query_type, policy.cache_similarity_threshold).__dict__


def preview(query: str, cache_hit: bool = False, local_capable: bool = False, policy: OptimizationPolicy = OptimizationPolicy()) -> dict:
    decision = decide_route(query, cache_hit, local_capable, policy)
    return {
        **decision,
        "output_policy": output_budget(query, policy),
    }

from __future__ import annotations

from cost_engine import ModelPricing
from cost_optimizer import OptimizationPolicy, optimization_preview
from router import preview as route_preview


def build_optimization_preview(
    query: str,
    original_input_tokens: int,
    optimized_input_tokens: int,
    *,
    cache_hit: bool = False,
    local_capable: bool = False,
    expected_output_tokens: int | None = None,
    pricing: ModelPricing = ModelPricing(0.0, 0.0),
    policy: OptimizationPolicy = OptimizationPolicy(),
) -> dict:
    route = route_preview(query, cache_hit=cache_hit, local_capable=local_capable, policy=policy)
    cost = optimization_preview(
        original_input_tokens,
        query,
        optimized_input_tokens,
        pricing,
        expected_output_tokens,
        policy,
    )
    return {"route": route, "cost": cost}

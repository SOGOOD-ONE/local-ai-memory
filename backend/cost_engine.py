from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPricing:
    input_per_million: float
    output_per_million: float


DEFAULT_PRICING = ModelPricing(input_per_million=0.0, output_per_million=0.0)


def estimate_cost(input_tokens: int, output_tokens: int, pricing: ModelPricing = DEFAULT_PRICING) -> dict:
    input_tokens = max(0, int(input_tokens))
    output_tokens = max(0, int(output_tokens))
    input_cost = input_tokens / 1_000_000 * pricing.input_per_million
    output_cost = output_tokens / 1_000_000 * pricing.output_per_million
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_cost": round(input_cost, 8),
        "output_cost": round(output_cost, 8),
        "total_cost": round(input_cost + output_cost, 8),
    }


def savings(original_input: int, optimized_input: int, original_output: int = 0, optimized_output: int = 0, pricing: ModelPricing = DEFAULT_PRICING) -> dict:
    before = estimate_cost(original_input, original_output, pricing)
    after = estimate_cost(optimized_input, optimized_output, pricing)
    return {
        "before": before,
        "after": after,
        "saved_cost": round(max(0.0, before["total_cost"] - after["total_cost"]), 8),
        "saved_input_tokens": max(0, int(original_input) - int(optimized_input)),
        "saved_output_tokens": max(0, int(original_output) - int(optimized_output)),
    }

from __future__ import annotations

import math
import re


# A deterministic local estimator used by the MVP. It is intentionally conservative:
# callers can later plug in tiktoken or a model-specific tokenizer without changing
# the storage/context APIs.
def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    # Roughly account for whitespace-separated words, CJK characters, and punctuation.
    cjk = len(re.findall(r"[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]", text))
    latin_words = len(re.findall(r"[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*", text))
    punctuation = len(re.findall(r"[^\w\s\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]", text, re.UNICODE))
    spaces = len(re.findall(r"\s+", text))
    return max(1, math.ceil(cjk + latin_words * 1.3 + punctuation * 0.5 + spaces * 0.15))


def estimate_messages(messages: list[dict]) -> int:
    return sum(estimate_tokens(str(message.get("content", ""))) for message in messages)


def compression_stats(original_tokens: int, compressed_tokens: int) -> dict:
    original = max(0, int(original_tokens))
    compressed = max(0, int(compressed_tokens))
    saved = max(0, original - compressed)
    rate = round((saved / original) * 100, 2) if original else 0.0
    return {
        "original_tokens": original,
        "compressed_tokens": compressed,
        "saved_tokens": saved,
        "reduction_percent": rate,
    }

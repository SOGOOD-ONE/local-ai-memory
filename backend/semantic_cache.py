from __future__ import annotations

import hashlib
import re
from collections import Counter


def normalize_query(query: str) -> str:
    return re.sub(r"\s+", " ", (query or "").strip().lower())


def cache_key(query: str, context_fingerprint: str = "") -> str:
    payload = normalize_query(query) + "\n" + context_fingerprint
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def token_similarity(a: str, b: str) -> float:
    a_terms = Counter(re.findall(r"[\w\u3400-\u9fff]+", normalize_query(a)))
    b_terms = Counter(re.findall(r"[\w\u3400-\u9fff]+", normalize_query(b)))
    if not a_terms or not b_terms:
        return 0.0
    common = sum(min(a_terms[k], b_terms[k]) for k in a_terms.keys() & b_terms.keys())
    denom = (sum(v * v for v in a_terms.values()) * sum(v * v for v in b_terms.values())) ** 0.5
    return common / denom if denom else 0.0

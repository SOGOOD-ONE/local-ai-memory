from __future__ import annotations

import math
import re
from collections import Counter

from database import list_memories


def terms(text: str) -> list[str]:
    return [t for t in re.findall(r"[A-Za-z0-9_'-]+|[\u3400-\u9fff]", text.lower()) if t.strip()]


def score(query: str, content: str) -> float:
    q = Counter(terms(query))
    c = Counter(terms(content))
    if not q or not c:
        return 0.0
    common = sum(min(q[k], c[k]) for k in q.keys() & c.keys())
    qn = math.sqrt(sum(v * v for v in q.values()))
    cn = math.sqrt(sum(v * v for v in c.values()))
    return common / (qn * cn) if qn and cn else 0.0


def retrieve(query: str, limit: int = 5) -> list[dict]:
    rows = list_memories(limit=200)
    ranked = []
    for row in rows:
        s = score(query, row['content'])
        ranked.append({**row, 'retrieval_score': round(s, 6)})
    ranked.sort(key=lambda x: (x['retrieval_score'], x['importance']), reverse=True)
    return ranked[:max(1, min(int(limit), 50))]

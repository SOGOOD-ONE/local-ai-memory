from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from database import get_connection
from semantic_cache import normalize_query, token_similarity


def init_cache_table() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS semantic_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL DEFAULT 'unknown',
                model TEXT,
                session_scope TEXT NOT NULL DEFAULT 'global',
                query TEXT NOT NULL,
                normalized_query TEXT NOT NULL,
                context_fingerprint TEXT NOT NULL DEFAULT '',
                response TEXT NOT NULL,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                hit_count INTEGER NOT NULL DEFAULT 0,
                last_hit_at TEXT,
                expires_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_semantic_cache_scope_platform
                ON semantic_cache(platform, model, session_scope);
            CREATE INDEX IF NOT EXISTS idx_semantic_cache_created
                ON semantic_cache(created_at DESC);
            """
        )


def put_cache(
    query: str,
    response: str,
    platform: str = "unknown",
    model: str | None = None,
    session_scope: str = "global",
    context_fingerprint: str = "",
    input_tokens: int = 0,
    output_tokens: int = 0,
    ttl_seconds: int = 86400,
) -> int:
    init_cache_table()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(1, int(ttl_seconds)))
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO semantic_cache(
                platform, model, session_scope, query, normalized_query,
                context_fingerprint, response, input_tokens, output_tokens,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                platform,
                model,
                session_scope,
                query,
                normalize_query(query),
                context_fingerprint,
                response,
                max(0, int(input_tokens)),
                max(0, int(output_tokens)),
                expires_at.isoformat(),
            ),
        )
        return int(cur.lastrowid)


def find_cache(
    query: str,
    platform: str = "unknown",
    model: str | None = None,
    session_scope: str = "global",
    threshold: float = 0.92,
) -> dict[str, Any] | None:
    init_cache_table()
    now = datetime.now(timezone.utc)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM semantic_cache
            WHERE platform=?
              AND session_scope=?
              AND (model IS NULL OR model=?)
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (platform, session_scope, model),
        ).fetchall()

        best: sqlite3.Row | None = None
        best_score = 0.0
        for row in rows:
            if row["expires_at"]:
                try:
                    if datetime.fromisoformat(row["expires_at"]) <= now:
                        continue
                except ValueError:
                    continue
            score = token_similarity(query, row["query"])
            if score > best_score:
                best_score = score
                best = row

        if best is None or best_score < float(threshold):
            return None

        conn.execute(
            "UPDATE semantic_cache SET hit_count=hit_count+1, last_hit_at=? WHERE id=?",
            (now.isoformat(), best["id"]),
        )
        result = dict(best)
        result["retrieval_score"] = round(best_score, 6)
        return result

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


DB_PATH = Path(__file__).resolve().parent / "data" / "memory.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL UNIQUE,
                platform TEXT NOT NULL DEFAULT 'unknown',
                title TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
                content TEXT NOT NULL,
                token_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                memory_type TEXT NOT NULL CHECK(memory_type IN ('short', 'medium', 'long')),
                content TEXT NOT NULL,
                importance REAL NOT NULL DEFAULT 0.5,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session_created
                ON messages(session_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_memories_type_importance
                ON memories(memory_type, importance DESC);
            """
        )


def upsert_session(session_id: str, platform: str = "unknown", title: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sessions(session_id, platform, title)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                platform=excluded.platform,
                title=COALESCE(excluded.title, sessions.title),
                updated_at=CURRENT_TIMESTAMP
            """,
            (session_id, platform, title),
        )


def add_message(session_id: str, role: str, content: str, token_count: int = 0) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO messages(session_id, role, content, token_count) VALUES (?, ?, ?, ?)",
            (session_id, role, content, token_count),
        )
        conn.execute(
            "UPDATE sessions SET updated_at=CURRENT_TIMESTAMP WHERE session_id=?",
            (session_id,),
        )
        return int(cur.lastrowid)


def list_messages(session_id: str, limit: int = 50) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, session_id, role, content, token_count, created_at
            FROM messages
            WHERE session_id=?
            ORDER BY id DESC
            LIMIT ?
            """,
            (session_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def add_memory(
    content: str,
    memory_type: str = "long",
    session_id: str | None = None,
    importance: float = 0.5,
    metadata: dict[str, Any] | None = None,
) -> int:
    importance = max(0.0, min(float(importance), 1.0))
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO memories(session_id, memory_type, content, importance, metadata_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, memory_type, content, importance, json.dumps(metadata or {}, ensure_ascii=False)),
        )
        return int(cur.lastrowid)


def list_memories(memory_type: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 200))
    with get_connection() as conn:
        if memory_type:
            rows = conn.execute(
                """
                SELECT id, session_id, memory_type, content, importance, metadata_json,
                       created_at, updated_at
                FROM memories
                WHERE memory_type=?
                ORDER BY importance DESC, updated_at DESC
                LIMIT ?
                """,
                (memory_type, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, session_id, memory_type, content, importance, metadata_json,
                       created_at, updated_at
                FROM memories
                ORDER BY importance DESC, updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    return [dict(row) for row in rows]

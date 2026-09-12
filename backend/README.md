# Backend architecture

The local service is intentionally layered:

- `app.py`: HTTP boundary only.
- `database.py`: SQLite persistence only.
- `retrieval.py`: candidate retrieval/ranking.
- `memory_lifecycle.py`: short/medium/long memory promotion.
- `context_engine.py`: final context policy and token budget.
- `token_engine.py`: token estimation abstraction.

## Memory lifecycle

1. Every observed message is stored in SQLite with an estimated token count.
2. The recent window remains available as short-term context.
3. Once a session reaches the configured threshold, a deterministic local summary is written as medium-term memory.
4. High-importance recent messages are promoted to long-term memory.
5. Retrieval can later be replaced by local embeddings without changing the HTTP contract.

The MVP summary is deterministic so the system has no dependency on a cloud LLM. Ollama/local LLM summarization can be added behind the same lifecycle interface later.

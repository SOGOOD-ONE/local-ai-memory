# Local AI Memory Architecture

## Goals

- Keep conversation history and memories on the user's machine.
- Share one memory engine between Chrome and Edge.
- Keep website-specific adapters isolated from storage and retrieval.
- Make token reduction measurable and reproducible.

## Layers

1. Extension layer: MV3 content scripts, popup, background service worker.
2. Adapter layer: ChatGPT, Doubao, Trea, and future web LLM adapters.
3. Local API layer: Flask on loopback only.
4. Context layer: memory retrieval, ranking, window selection, token budgeting.
5. Storage layer: SQLite for sessions, messages, memories, and metrics.
6. Optional local model layer: embedding and summarization providers.

## Data flow

User question -> site adapter -> local Context API -> retrieval/ranking -> context builder -> compact context -> site adapter -> web LLM.

Assistant response -> site adapter -> local Message API -> durable history -> memory extraction/update.

## Design rules

- Never couple an adapter to SQLite directly.
- Never require an embedding model for the MVP retrieval path.
- Use deterministic lexical retrieval as a fallback when embedding is unavailable.
- Do not discard source messages when creating summaries; summaries are derived data.
- Every context build returns original token estimate, compact token estimate, saved tokens, and reduction percent.
- Adapter code must tolerate DOM changes and fail closed without blocking the underlying website.
- Chrome and Edge use the same extension package and code path unless a browser-specific API is actually required.

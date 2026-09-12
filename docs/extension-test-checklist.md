# Extension integration test checklist

## 1. Local service

- Start the Flask service on `127.0.0.1:8765`.
- Verify `GET /api/health` returns `status=ok`.
- Verify `POST /api/optimize/preview` accepts a query and returns route/cost data.

## 2. Page adapter

For each supported site:

1. Open an existing conversation.
2. Confirm the content script detects visible messages.
3. Confirm the latest user message is used as `query`.
4. Confirm repeated DOM mutations do not create repeated identical optimization requests.
5. Disconnect the local service and confirm the page remains usable.

## 3. Send safety

Optimization may only replace the composer when the current composer text exactly matches the query that produced the optimization result. Any mismatch must leave the user's text unchanged.

The current sender layer is intentionally non-destructive: it can prepare an optimized composer value, but it must not click Send automatically until platform-specific integration has been verified on the live UI.

## 4. Acceptance criteria

- Original user text is preserved when optimization is unavailable.
- Optimized context is never silently appended to an unrelated draft.
- A cache decision is visible to the extension layer.
- Original and optimized input token counts are available for cost reporting.
- Chrome and Edge use the same extension code path.

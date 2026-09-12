# Send pipeline

The extension separates observation, optimization, and send-time application.

```text
page DOM
  -> platform adapter
  -> local optimization API
  -> optimization result
  -> send bridge
  -> platform-specific sender
```

## Safety rules

1. Observation never changes the page.
2. An optimization result is only considered send-ready when it contains `optimized_messages`.
3. Cache hits are exposed to the sender as `cache_hit`; the platform adapter decides whether a cached answer can be displayed without a new model request.
4. A compressed candidate may replace the outgoing context only when the adapter can identify the active composer and preserve the user's original text.
5. The original user text is never discarded locally.
6. Platform adapters remain isolated from the optimization engine.

## Current milestone

The repository now contains the common `adapter.js`, platform adapters, and `send_bridge.js`. The bridge converts an optimization result into a normalized send-ready event.

The remaining platform work is sender-specific: identify the native composer/send path and apply the normalized result without depending on undocumented application internals.

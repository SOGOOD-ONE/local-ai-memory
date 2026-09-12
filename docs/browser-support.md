# Browser support

## Target browsers

- Microsoft Edge (Chromium): first-class target.
- Google Chrome (Chromium): first-class target.

The extension is implemented with Manifest V3 and the Chromium extension APIs shared by modern Edge and Chrome. Microsoft documents that Chrome extensions can generally be ported to Edge with minimal changes when the APIs used are supported.

## Local installation on Edge

1. Open `edge://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `extension/` directory.
5. Keep the local Flask service running at `http://127.0.0.1:8765`.
6. Open a supported LLM website and check the extension popup.

The same `extension/` directory is intended to be loadable in Chrome at `chrome://extensions/` with Developer mode enabled.

## Design rule

Do not fork the core memory engine by browser. Edge and Chrome use the same extension code wherever possible. Browser-specific differences belong in the adapter layer, not in the memory engine.

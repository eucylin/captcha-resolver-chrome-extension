# BlazCaptcha - Chrome Extension

## Project Overview

BlazCaptcha is a Chrome extension (Manifest v3) that auto-detects and solves image CAPTCHAs using local WASM-based OCR. No external API, no server, fully offline and privacy-preserving.

## Tech Stack

- **Language:** TypeScript 5.7, targeting ES2020
- **Bundler:** Webpack 5 with ts-loader
- **OCR Engine:** ddddocr-node (ONNX models) + onnxruntime-web (WASM runtime)
- **Chrome APIs:** activeTab, contextMenus, offscreen, storage, tabs.captureVisibleTab (with `<all_urls>` host permission)
- **i18n:** en, zh_TW via `chrome.i18n` and `_locales/`

## Architecture

```
src/
├── background/       # Service worker (message routing, tab capture, context menu)
│   ├── index.ts           # Entry point, registers listeners
│   ├── messageRouter.ts   # Routes OCR requests and visible-tab capture
│   ├── offscreenManager.ts # Manages offscreen document lifecycle (5-min idle timeout)
│   └── contextMenu.ts     # Right-click "Recognize this CAPTCHA" menu
├── content/          # Content scripts (injected into web pages)
│   ├── index.ts           # Entry point, initializes detection
│   ├── detector.ts        # CAPTCHA detection scoring algorithm (threshold ≥ 3)
│   ├── observer.ts        # MutationObserver for dynamically loaded CAPTCHAs
│   ├── buttonInjector.ts  # Injects solve button (Shadow DOM) next to CAPTCHAs
│   ├── captureUtils.ts    # Visible-tab screenshot + per-element crop (cross-origin path)
│   ├── contextMenuCapture.ts # Handles right-click "recognize" via capture + OCR
│   ├── clickToFill.ts     # Toast + click-any-input-to-fill mode
│   └── styles.ts          # Shadow DOM CSS styles
├── offscreen/        # Offscreen document (runs WASM OCR engine)
│   ├── ocrEngine.ts       # ddddocr-node initialization and inference
│   └── offscreen.html     # Minimal HTML host
├── popup/            # Extension popup UI
│   ├── popup.html         # Template with data-i18n attributes
│   ├── popup.ts           # Logic: drag-drop, paste, history, settings toggle
│   └── popup.css          # Styles (320px width)
└── shared/           # Shared code
    ├── constants.ts       # Keywords, size constraints, thresholds, config values
    └── messages.ts        # Message type definitions for inter-component communication
```

## Message Flow

```
Content Script / Popup
    ↓ OCR_REQUEST (base64 image)
Background Service Worker
    ↓ forwards to offscreen document
Offscreen Document (WASM OCR)
    ↓ OCR_RESPONSE (text or error)
Background → Content Script / Popup
```

Other messages: `CAPTURE_TAB` (visible-tab screenshot for cross-origin CAPTCHAs; avoids re-fetching the image URL which some servers treat as a refresh request), `CONTEXT_MENU_CAPTURE` (background → content script trigger for right-click OCR), `GET_SETTINGS`/`SETTINGS_RESPONSE`.

## Build Commands

```bash
npm run build    # Production build → dist/
npm run dev      # Development build with watch mode
```

Output goes to `dist/`. Webpack copies: manifest, _locales, icons, ONNX models, WASM files.

## Testing

```bash
node test/test-detector.mjs    # Unit tests for CAPTCHA detection scoring
```

Manual test page: `test/test-page.html` (open in browser with extension loaded).

## Key Conventions

- **Shadow DOM** for all injected UI to isolate from page CSS
- **DOM API only** — never use `innerHTML` (XSS prevention)
- **Sender validation** on all message handlers (`sender.id === chrome.runtime.id`)
- **No network fetch of CAPTCHA URLs** — cross-origin path uses `captureVisibleTab` so the server is never re-hit
- **Size limit** of 2MB on base64 image data
- **OCR results** truncated to 20 characters before storage
- **Lazy init** for offscreen document with 5-minute idle auto-close
- **i18n** via `chrome.i18n.getMessage()` — all user-facing strings must be in `_locales/`

## Security Rules

1. Never expose `web_accessible_resources`
2. Always validate message senders
3. Never use `innerHTML` — use `textContent` + `createElement`
4. Do NOT fetch CAPTCHA image URLs from the extension — many servers treat any GET as a token-invalidating refresh. Use `chrome.tabs.captureVisibleTab` + per-element crop for cross-origin images instead.
5. Keep permissions minimal (host_permissions `<all_urls>` is required only for `captureVisibleTab`)

## Static Assets

- `public/manifest.json` — Extension manifest
- `public/_locales/` — i18n translations (en, zh_TW)
- `public/icons/` — Extension icons (16, 48, 128px + button20 + store_icon128)
- `screenshots/` — Chrome Web Store listing assets

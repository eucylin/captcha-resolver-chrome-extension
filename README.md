# BlazCaptcha

**Free and Lightweight Image CAPTCHA Solver** — A Chrome extension that auto-detects and solves image CAPTCHAs using local OCR. No server, no API key, no signup — 100% free and privacy-friendly.

## Features

- **Local OCR** — All recognition runs locally via WASM. Your images never leave the browser.
- **Auto-Detection** — Automatically finds CAPTCHA images on the page and injects a solve button.
- **Three Usage Methods** — Auto-detect button, right-click context menu, or popup manual input.
- **Auto-Fill** — Recognizes nearby input fields and fills in the result automatically.
- **Multi-Language** — Supports English and Traditional Chinese (繁體中文).

## How It Works

| Method | How to Use |
|--------|-----------|
| **Auto-Detect** | Enable auto-detect → A 🔍 button appears next to detected CAPTCHAs → Click to solve and auto-fill |
| **Right-Click** | Right-click any image → "Recognize this CAPTCHA" → Result copied to clipboard → Click any input to fill |
| **Popup** | Click extension icon → Drag & drop or paste an image → View result and copy |

## Installation

### From Source

1. **Clone and install dependencies:**

   ```bash
   git clone https://github.com/anthropics/captcha-resolver-chrome-extension.git
   cd captcha-resolver-chrome-extension
   npm install
   ```

2. **Build the extension:**

   ```bash
   npm run build
   ```

3. **Load in Chrome:**

   - Open `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)
   - Click "Load unpacked"
   - Select the `dist/` directory

### Development

```bash
npm run dev    # Build with watch mode — auto-rebuilds on file changes
```

After rebuilding, click the refresh icon on `chrome://extensions/` to reload the extension.

## Tech Stack

- **TypeScript** + **Webpack 5** — Modern build pipeline
- **Manifest v3** — Latest Chrome extension platform
- **ddddocr-node** + **onnxruntime-web** — WASM-based OCR engine with ONNX models
- **Shadow DOM** — Injected UI isolated from page styles

## Architecture

```
src/
├── background/    # Service worker: message routing, CORS bypass, context menu
├── content/       # Content scripts: CAPTCHA detection, button injection, auto-fill
├── offscreen/     # Offscreen document: WASM OCR engine
├── popup/         # Extension popup: manual input, history, settings
└── shared/        # Shared constants and message types
```

**OCR Pipeline:** Content script detects CAPTCHA → sends image to background service worker → forwarded to offscreen document → WASM OCR processes image → result returned and auto-filled.

## Testing

```bash
node test/test-detector.mjs    # Run CAPTCHA detection unit tests
```

A manual test page is also available at `test/test-page.html` — open it in Chrome with the extension loaded to test button injection.

## Privacy & Security

- **100% Local** — Images are processed locally via WASM. Nothing is sent to external servers.
- **Minimal Permissions** — Only requests `activeTab`, `contextMenus`, `offscreen`, and `storage`.
- **No Web-Accessible Resources** — Extension internals are not exposed to web pages.
- **Input Validation** — Blocks private IPs, enforces image content-type, validates message senders, limits payload size.

## License

MIT

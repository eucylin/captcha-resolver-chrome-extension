import { OcrRequest, OcrResponse } from '../shared/messages';

let ocrInstance: any = null;
let initPromise: Promise<void> | null = null;

async function initOcr(): Promise<void> {
  if (ocrInstance) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Configure onnxruntime-web WASM path before importing ddddocr-node
      const ort = await import('onnxruntime-web');
      ort.env.wasm.wasmPaths = chrome.runtime.getURL('wasm/');

      const { DdddOcr } = await import('ddddocr-node');
      const instance = new DdddOcr();
      // Point models to extension's bundled resources
      instance.setPath(chrome.runtime.getURL('models/'));
      ocrInstance = instance;
      console.log('[CAPTCHA Solver] OCR engine initialized');
    } catch (err) {
      console.error('[CAPTCHA Solver] OCR init failed:', err);
      ocrInstance = null;
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

async function recognize(imageData: string): Promise<string> {
  await initOcr();
  // classification() accepts a URL or data URL — it will fetch internally
  const result = await ocrInstance.classification(imageData);
  return result;
}

chrome.runtime.onMessage.addListener(
  (message: OcrRequest, _sender, sendResponse: (response: OcrResponse) => void) => {
    if (message.type !== 'OCR_REQUEST') return false;

    recognize(message.imageData)
      .then(text => sendResponse({ type: 'OCR_RESPONSE', text }))
      .catch(err => sendResponse({ type: 'OCR_RESPONSE', error: String(err) }));

    return true; // async response
  }
);

console.log('[CAPTCHA Solver] Offscreen document loaded');

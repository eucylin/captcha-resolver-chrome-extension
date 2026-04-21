import { captureElement } from './captureUtils';
import { showClickToFill } from './clickToFill';
import type {
  ContextMenuCaptureRequest,
  OcrResponse,
} from '../shared/messages';

const MAX_OCR_RESULT_LENGTH = 20;

function findImageBySrc(srcUrl: string): HTMLImageElement | null {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  return (
    images.find((img) => img.src === srcUrl) ||
    images.find((img) => img.currentSrc === srcUrl) ||
    null
  );
}

async function handle(request: ContextMenuCaptureRequest): Promise<void> {
  const img = findImageBySrc(request.srcUrl);
  if (!img) {
    console.error('[CAPTCHA Solver] Context menu: could not locate image', request.srcUrl);
    return;
  }

  try {
    const imageData = await captureElement(img);
    const response: OcrResponse = await chrome.runtime.sendMessage({
      type: 'OCR_REQUEST',
      imageData,
    });
    if (response.error || !response.text) {
      throw new Error(response.error || 'Empty OCR result');
    }

    showClickToFill(response.text);

    const sanitized = response.text.slice(0, MAX_OCR_RESULT_LENGTH);
    chrome.storage.local.get({ history: [] }, (data) => {
      const history = data.history as Array<{ url?: string; text: string; time: number }>;
      history.unshift({ url: request.srcUrl, text: sanitized, time: Date.now() });
      if (history.length > 10) history.length = 10;
      chrome.storage.local.set({ history });
    });
  } catch (err) {
    console.error('[CAPTCHA Solver] Context menu OCR failed:', err);
  }
}

export function setupContextMenuCaptureListener(): void {
  chrome.runtime.onMessage.addListener((message: ContextMenuCaptureRequest) => {
    if (message?.type !== 'CONTEXT_MENU_CAPTURE') return;
    handle(message);
  });
}

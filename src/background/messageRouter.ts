import { ensureOffscreen } from './offscreenManager';
import type { OcrRequest, OcrResponse, CaptureTabResponse } from '../shared/messages';

const MAX_IMAGE_DATA_SIZE = 2 * 1024 * 1024; // 2MB base64

export async function handleOcrRequest(imageData: string): Promise<OcrResponse> {
  if (typeof imageData !== 'string') {
    return { type: 'OCR_RESPONSE', error: 'Invalid imageData: expected string' };
  }
  if (imageData.length > MAX_IMAGE_DATA_SIZE) {
    return { type: 'OCR_RESPONSE', error: 'Image data exceeds 2MB limit' };
  }

  await ensureOffscreen();

  return new Promise((resolve) => {
    const request: OcrRequest = { type: 'OCR_REQUEST', imageData };
    chrome.runtime.sendMessage(request, (response: OcrResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ type: 'OCR_RESPONSE', error: chrome.runtime.lastError.message });
      } else if (!response || response.type !== 'OCR_RESPONSE') {
        resolve({ type: 'OCR_RESPONSE', error: 'No response from OCR engine' });
      } else {
        resolve(response);
      }
    });
  });
}

export async function handleCaptureTab(tabId?: number): Promise<CaptureTabResponse> {
  try {
    const windowId = tabId != null
      ? (await chrome.tabs.get(tabId)).windowId
      : chrome.windows.WINDOW_ID_CURRENT;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    if (!dataUrl) {
      return { type: 'CAPTURE_TAB_RESPONSE', error: 'captureVisibleTab returned empty result' };
    }
    return { type: 'CAPTURE_TAB_RESPONSE', dataUrl };
  } catch (err) {
    return { type: 'CAPTURE_TAB_RESPONSE', error: (err as Error).message };
  }
}

import { ensureOffscreen } from './offscreenManager';
import type { OcrRequest, OcrResponse, FetchImageRequest, FetchImageResponse } from '../shared/messages';

export async function handleOcrRequest(imageData: string): Promise<OcrResponse> {
  await ensureOffscreen();

  return new Promise((resolve) => {
    const request: OcrRequest = { type: 'OCR_REQUEST', imageData };
    chrome.runtime.sendMessage(request, (response: OcrResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ type: 'OCR_RESPONSE', error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

export async function handleFetchImage(url: string): Promise<FetchImageResponse> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();

    return new Promise((resolve) => {
      reader.onloadend = () => {
        resolve({ type: 'FETCH_IMAGE_RESPONSE', dataUrl: reader.result as string });
      };
      reader.onerror = () => {
        resolve({ type: 'FETCH_IMAGE_RESPONSE', error: 'Failed to read image' });
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return { type: 'FETCH_IMAGE_RESPONSE', error: String(err) };
  }
}

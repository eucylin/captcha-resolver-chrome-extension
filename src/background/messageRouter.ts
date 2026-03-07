import { ensureOffscreen } from './offscreenManager';
import type { OcrRequest, OcrResponse, FetchImageResponse } from '../shared/messages';

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

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && !parsed.protocol.startsWith('data:')) {
      return false;
    }
    // Block private/internal IP ranges
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function handleFetchImage(url: string): Promise<FetchImageResponse> {
  if (typeof url !== 'string') {
    return { type: 'FETCH_IMAGE_RESPONSE', error: 'Invalid URL: expected string' };
  }
  if (!isAllowedUrl(url)) {
    return { type: 'FETCH_IMAGE_RESPONSE', error: 'URL not allowed: must be http/https and non-private' };
  }

  try {
    const response = await fetch(url);

    // Validate content-type is an image
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return { type: 'FETCH_IMAGE_RESPONSE', error: `Invalid content-type: ${contentType}` };
    }

    const blob = await response.blob();

    // Reject oversized images
    if (blob.size > MAX_IMAGE_DATA_SIZE) {
      return { type: 'FETCH_IMAGE_RESPONSE', error: 'Image exceeds 2MB size limit' };
    }

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

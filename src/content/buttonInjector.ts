import { BUTTON_STYLES } from './styles';
import type { CaptchaCandidate } from './detector';
import type { OcrResponse, FetchImageResponse } from '../shared/messages';

export function injectButton(candidate: CaptchaCandidate): void {
  const { element, input } = candidate;

  // Mark as processed
  element.dataset.captchaSolverProcessed = '1';

  // Create shadow host
  const host = document.createElement('span');
  host.className = 'captcha-solver-host';
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = BUTTON_STYLES;
  shadow.appendChild(style);

  // Create button
  const btn = document.createElement('button');
  btn.className = 'captcha-btn';
  btn.title = chrome.i18n.getMessage('recognizeButton');

  btn.textContent = '🔍';
  shadow.appendChild(btn);

  // Insert after the captcha image
  element.parentElement?.insertBefore(host, element.nextSibling);

  // Click handler
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (btn.classList.contains('loading')) return;

    btn.classList.remove('success', 'error');
    btn.classList.add('loading');
    btn.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    btn.appendChild(spinner);

    try {
      const imageData = await getImageData(element);
      const response: OcrResponse = await chrome.runtime.sendMessage({
        type: 'OCR_REQUEST',
        imageData,
      });

      if (response.error) throw new Error(response.error);
      if (input && response.text) {
        input.value = response.text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Save to history
        saveToHistory(response.text);
      }

      btn.textContent = '✓';
      btn.classList.remove('loading');
      btn.classList.add('success');
    } catch (err) {
      btn.textContent = '✗';
      btn.classList.remove('loading');
      btn.classList.add('error');
      console.error('[CAPTCHA Solver]', err);
    }

    // Reset button after 2s
    setTimeout(() => {
      btn.textContent = '🔍';
      btn.classList.remove('success', 'error');
    }, 2000);
  });
}

async function getImageData(el: HTMLImageElement | HTMLCanvasElement): Promise<string> {
  if (el instanceof HTMLCanvasElement) {
    return el.toDataURL('image/png');
  }

  // Try same-origin canvas approach first
  try {
    const canvas = document.createElement('canvas');
    const img = el as HTMLImageElement;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Cross-origin: fetch via background service worker
    const response: FetchImageResponse = await chrome.runtime.sendMessage({
      type: 'FETCH_IMAGE',
      url: el.src || (el as HTMLImageElement).currentSrc,
    });

    if (response.error || !response.dataUrl) {
      throw new Error(response.error || 'Failed to fetch image');
    }

    return response.dataUrl;
  }
}

function saveToHistory(text: string): void {
  const sanitized = text.slice(0, 20);
  chrome.storage.local.get({ history: [] }, (data) => {
    const history = data.history as Array<{ text: string; time: number }>;
    history.unshift({ text: sanitized, time: Date.now() });
    if (history.length > 10) history.length = 10;
    chrome.storage.local.set({ history });
  });
}

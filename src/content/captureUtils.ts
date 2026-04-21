import type { CaptureTabResponse } from '../shared/messages';

const INJECTED_UI_SELECTOR = '.captcha-solver-host, #captcha-solver-toast';

export async function captureElement(el: HTMLElement): Promise<string> {
  const injected = Array.from(
    document.querySelectorAll<HTMLElement>(INJECTED_UI_SELECTOR),
  );
  const prevVisibility = injected.map((n) => n.style.visibility);
  injected.forEach((n) => {
    n.style.visibility = 'hidden';
  });

  try {
    const initialRect = el.getBoundingClientRect();
    const inViewport =
      initialRect.top >= 0 &&
      initialRect.left >= 0 &&
      initialRect.bottom <= window.innerHeight &&
      initialRect.right <= window.innerWidth;

    if (!inViewport) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      throw new Error('Target element has zero size');
    }
    if (
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= window.innerWidth ||
      rect.top >= window.innerHeight
    ) {
      throw new Error('Target element is outside the viewport');
    }

    const response: CaptureTabResponse = await chrome.runtime.sendMessage({
      type: 'CAPTURE_TAB',
    });
    if (!response || response.error || !response.dataUrl) {
      throw new Error(response?.error || 'Failed to capture tab');
    }

    const screenshot = new Image();
    await new Promise<void>((resolve, reject) => {
      screenshot.onload = () => resolve();
      screenshot.onerror = () => reject(new Error('Failed to decode screenshot'));
      screenshot.src = response.dataUrl!;
    });

    const dpr = window.devicePixelRatio || 1;
    const sx = Math.max(0, Math.round(rect.left * dpr));
    const sy = Math.max(0, Math.round(rect.top * dpr));
    const sw = Math.min(
      screenshot.naturalWidth - sx,
      Math.round(rect.width * dpr),
    );
    const sh = Math.min(
      screenshot.naturalHeight - sy,
      Math.round(rect.height * dpr),
    );
    if (sw < 1 || sh < 1) {
      throw new Error('Cropped region has zero size');
    }

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to obtain 2D context');
    ctx.drawImage(screenshot, sx, sy, sw, sh, 0, 0, sw, sh);

    return canvas.toDataURL('image/png');
  } finally {
    injected.forEach((n, i) => {
      n.style.visibility = prevVisibility[i] ?? '';
    });
  }
}

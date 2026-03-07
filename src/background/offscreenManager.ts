import { OFFSCREEN_IDLE_TIMEOUT } from '../shared/constants';

let idleTimer: ReturnType<typeof setTimeout> | null = null;

export async function ensureOffscreen(): Promise<void> {
  resetIdleTimer();

  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run WASM-based OCR engine for CAPTCHA recognition',
  });
}

export async function closeOffscreen(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) {
    await chrome.offscreen.closeDocument();
  }
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    closeOffscreen();
  }, OFFSCREEN_IDLE_TIMEOUT);
}

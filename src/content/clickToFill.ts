import { TOAST_STYLES } from './styles';
import type { ContextMenuOcrResult } from '../shared/messages';

let currentToast: HTMLElement | null = null;
let currentText: string | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

export function showClickToFill(text: string): void {
  cleanup();

  currentText = text;

  // Create toast with shadow DOM
  const host = document.createElement('div');
  host.id = 'captcha-solver-toast';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = TOAST_STYLES;
  shadow.appendChild(style);

  const toast = document.createElement('div');
  toast.className = 'toast';

  const resultDiv = document.createElement('div');
  resultDiv.append('CAPTCHA result: ');
  const resultSpan = document.createElement('span');
  resultSpan.className = 'result';
  resultSpan.textContent = text;
  resultDiv.appendChild(resultSpan);
  toast.appendChild(resultDiv);

  const hintDiv = document.createElement('div');
  hintDiv.className = 'hint';
  hintDiv.textContent = 'Click any input field to fill, press Esc to cancel';
  toast.appendChild(hintDiv);

  shadow.appendChild(toast);

  document.body.appendChild(host);
  currentToast = host;

  // Click handler: fill clicked input
  clickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      e.preventDefault();
      e.stopPropagation();
      target.value = currentText!;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      cleanup();
    }
  };

  // Esc handler: cancel
  escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  };

  document.addEventListener('click', clickHandler, true);
  document.addEventListener('keydown', escHandler, true);

  // Auto-dismiss after 15s
  setTimeout(cleanup, 15000);
}

function cleanup(): void {
  if (currentToast) {
    currentToast.remove();
    currentToast = null;
  }
  currentText = null;

  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }
  if (escHandler) {
    document.removeEventListener('keydown', escHandler, true);
    escHandler = null;
  }
}

export function setupContextMenuListener(): void {
  chrome.runtime.onMessage.addListener((message: ContextMenuOcrResult) => {
    if (message.type !== 'CONTEXT_MENU_OCR_RESULT') return;

    if (message.error) {
      console.error('[CAPTCHA Solver] Context menu OCR error:', message.error);
      return;
    }

    if (message.text) {
      showClickToFill(message.text);
    }
  });
}

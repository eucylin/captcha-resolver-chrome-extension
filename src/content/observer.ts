import { detectCaptchas } from './detector';
import { injectButton } from './buttonInjector';

let observer: MutationObserver | null = null;

export function startObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    let hasNewNodes = false;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.matches?.('img, canvas') || node.querySelector?.('img, canvas')) {
            hasNewNodes = true;
            break;
          }
        }
      }
      if (hasNewNodes) break;
    }

    if (hasNewNodes) {
      // Debounce: wait for DOM to settle
      setTimeout(scanAndInject, 200);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export function stopObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

export function scanAndInject(): void {
  const candidates = detectCaptchas();
  for (const candidate of candidates) {
    injectButton(candidate);
  }
}

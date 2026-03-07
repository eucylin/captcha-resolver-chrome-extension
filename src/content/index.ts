import { scanAndInject } from './observer';
import { startObserver, stopObserver } from './observer';
import { setupContextMenuListener } from './clickToFill';

async function init(): Promise<void> {
  // Check settings
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const autoDetect = response?.autoDetect ?? true;

  // Always listen for context menu results
  setupContextMenuListener();

  if (autoDetect) {
    // Initial scan
    scanAndInject();

    // Watch for dynamically loaded CAPTCHAs
    startObserver();
  }

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.autoDetect) {
      if (changes.autoDetect.newValue) {
        scanAndInject();
        startObserver();
      } else {
        stopObserver();
      }
    }
  });
}

init();

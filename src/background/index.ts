import { setupContextMenu } from './contextMenu';
import { handleOcrRequest, handleFetchImage } from './messageRouter';
import { CONTEXT_MENU_ID } from '../shared/constants';
import type { MessageRequest, ContextMenuOcrResult } from '../shared/messages';

// Setup context menu on install
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});

// Message routing from content scripts
chrome.runtime.onMessage.addListener((message: MessageRequest, sender, sendResponse) => {
  if (message.type === 'OCR_REQUEST') {
    handleOcrRequest(message.imageData).then(sendResponse);
    return true;
  }

  if (message.type === 'FETCH_IMAGE') {
    handleFetchImage(message.url).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get({ autoDetect: true }, (settings) => {
      sendResponse({ type: 'SETTINGS_RESPONSE', autoDetect: settings.autoDetect });
    });
    return true;
  }

  return false;
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.srcUrl || !tab?.id) return;

  try {
    // Fetch image via background (bypasses CORS)
    const imgResponse = await handleFetchImage(info.srcUrl);
    if (imgResponse.error || !imgResponse.dataUrl) {
      notifyTab(tab.id, { type: 'CONTEXT_MENU_OCR_RESULT', error: imgResponse.error || 'Failed to fetch image' });
      return;
    }

    // Run OCR
    const ocrResponse = await handleOcrRequest(imgResponse.dataUrl);
    notifyTab(tab.id, {
      type: 'CONTEXT_MENU_OCR_RESULT',
      text: ocrResponse.text,
      error: ocrResponse.error,
    });

    // Save to history
    if (ocrResponse.text) {
      saveToHistory(info.srcUrl, ocrResponse.text);
    }
  } catch (err) {
    notifyTab(tab.id, { type: 'CONTEXT_MENU_OCR_RESULT', error: String(err) });
  }
});

function notifyTab(tabId: number, message: ContextMenuOcrResult): void {
  chrome.tabs.sendMessage(tabId, message);
}

function saveToHistory(imageUrl: string, text: string): void {
  chrome.storage.local.get({ history: [] }, (data) => {
    const history = data.history as Array<{ url: string; text: string; time: number }>;
    history.unshift({ url: imageUrl, text, time: Date.now() });
    if (history.length > 10) history.length = 10;
    chrome.storage.local.set({ history });
  });
}

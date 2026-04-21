import { setupContextMenu } from './contextMenu';
import { handleOcrRequest, handleCaptureTab } from './messageRouter';
import { CONTEXT_MENU_ID } from '../shared/constants';
import type { MessageRequest, ContextMenuCaptureRequest } from '../shared/messages';

// Setup context menu on install, open welcome page on first install
chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenu();

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// Message routing from content scripts
chrome.runtime.onMessage.addListener((message: MessageRequest, sender, sendResponse) => {
  // Validate sender is our own extension
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'OCR_REQUEST' && typeof message.imageData === 'string') {
    handleOcrRequest(message.imageData).then(sendResponse);
    return true;
  }

  if (message.type === 'CAPTURE_TAB') {
    handleCaptureTab(sender.tab?.id).then(sendResponse);
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

// Context menu click handler — delegate to the content script so the CAPTCHA
// image is read from painted pixels instead of a fresh HTTP fetch.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.srcUrl || !tab?.id) return;

  const request: ContextMenuCaptureRequest = {
    type: 'CONTEXT_MENU_CAPTURE',
    srcUrl: info.srcUrl,
  };
  chrome.tabs.sendMessage(tab.id, request).catch((err) => {
    console.error('[CAPTCHA Solver] Context menu delivery failed:', err);
  });
});

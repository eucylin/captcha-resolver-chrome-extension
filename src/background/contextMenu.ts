import { CONTEXT_MENU_ID } from '../shared/constants';

export function setupContextMenu(): void {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Recognize this CAPTCHA',
    contexts: ['image'],
  });
}

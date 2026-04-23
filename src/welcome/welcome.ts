// i18n initialization for welcome page
document.querySelectorAll('[data-i18n]').forEach((el) => {
  const key = el.getAttribute('data-i18n')!;
  const msg = chrome.i18n.getMessage(key);
  if (msg) {
    el.textContent = msg;
  }
});

// Set document lang attribute based on locale
const lang = chrome.i18n.getUILanguage();
document.documentElement.lang = lang;

// Set page title
const titleEl = document.querySelector('title[data-i18n]');
if (titleEl) {
  const key = titleEl.getAttribute('data-i18n')!;
  const msg = chrome.i18n.getMessage(key);
  if (msg) {
    document.title = msg;
  }
}

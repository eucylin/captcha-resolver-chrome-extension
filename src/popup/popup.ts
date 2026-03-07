import './popup.css';
import type { OcrResponse } from '../shared/messages';

const autoDetectToggle = document.getElementById('autoDetect') as HTMLInputElement;
const dropZone = document.getElementById('dropZone') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const manualResult = document.getElementById('manualResult') as HTMLDivElement;
const resultText = document.getElementById('resultText') as HTMLSpanElement;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const historyList = document.getElementById('historyList') as HTMLUListElement;

// Load settings
chrome.storage.local.get({ autoDetect: true }, (data) => {
  autoDetectToggle.checked = data.autoDetect;
});

// Toggle auto-detect
autoDetectToggle.addEventListener('change', () => {
  chrome.storage.local.set({ autoDetect: autoDetectToggle.checked });
});

// Drop zone events
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('image/')) {
    recognizeFile(file);
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) recognizeFile(file);
});

// Paste support
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) recognizeFile(file);
      break;
    }
  }
});

// Copy button
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(resultText.textContent || '');
  copyBtn.textContent = '✓';
  setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
});

async function recognizeFile(file: File): Promise<void> {
  dropZone.classList.add('loading');
  dropZone.querySelector('p')!.textContent = 'Recognizing...';

  try {
    const dataUrl = await fileToDataUrl(file);
    const response: OcrResponse = await chrome.runtime.sendMessage({
      type: 'OCR_REQUEST',
      imageData: dataUrl,
    });

    if (response.error) throw new Error(response.error);

    resultText.textContent = response.text || '';
    manualResult.hidden = false;

    // Save to history
    if (response.text) {
      chrome.storage.local.get({ history: [] }, (data) => {
        const history = data.history as Array<{ text: string; time: number }>;
        history.unshift({ text: response.text!, time: Date.now() });
        if (history.length > 10) history.length = 10;
        chrome.storage.local.set({ history });
        renderHistory(history);
      });
    }
  } catch (err) {
    resultText.textContent = `Error: ${err}`;
    manualResult.hidden = false;
  } finally {
    dropZone.classList.remove('loading');
    dropZone.querySelector('p')!.textContent = 'Drag & drop or paste an image';
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Load and render history
function renderHistory(history: Array<{ text: string; time: number }>): void {
  while (historyList.firstChild) historyList.firstChild.remove();

  if (history.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'empty';
    emptyLi.textContent = 'No records yet';
    historyList.appendChild(emptyLi);
    return;
  }

  for (const item of history) {
    const li = document.createElement('li');
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.textContent = item.text;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = formatTime(item.time);

    li.appendChild(textSpan);
    li.appendChild(timeSpan);
    historyList.appendChild(li);
  }
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Initial history load
chrome.storage.local.get({ history: [] }, (data) => {
  renderHistory(data.history);
});

import { CAPTCHA_KEYWORDS, CAPTCHA_SIZE, SCORE_THRESHOLD } from '../shared/constants';

export interface CaptchaCandidate {
  element: HTMLImageElement | HTMLCanvasElement;
  score: number;
  input: HTMLInputElement | null;
}

export function detectCaptchas(): CaptchaCandidate[] {
  const candidates: CaptchaCandidate[] = [];
  const elements = document.querySelectorAll<HTMLImageElement | HTMLCanvasElement>('img, canvas');

  for (const el of elements) {
    // Skip already processed elements
    if (el.dataset.captchaSolverProcessed) continue;

    const score = scoreCaptcha(el);
    if (score >= SCORE_THRESHOLD) {
      const input = findNearestInput(el);
      candidates.push({ element: el, score, input });
    }
  }

  return candidates;
}

function scoreCaptcha(el: HTMLImageElement | HTMLCanvasElement): number {
  let score = 0;

  // Size check
  const rect = el.getBoundingClientRect();
  const w = rect.width || (el as HTMLImageElement).naturalWidth || 0;
  const h = rect.height || (el as HTMLImageElement).naturalHeight || 0;

  if (w >= CAPTCHA_SIZE.minWidth && w <= CAPTCHA_SIZE.maxWidth &&
      h >= CAPTCHA_SIZE.minHeight && h <= CAPTCHA_SIZE.maxHeight) {
    score += 2;
  }

  // Attribute keyword check
  const attrs = [
    el.getAttribute('src') || '',
    el.id,
    el.className,
    el.getAttribute('name') || '',
    el.getAttribute('alt') || '',
  ].join(' ').toLowerCase();

  if (CAPTCHA_KEYWORDS.some(kw => attrs.includes(kw))) {
    score += 3;
  }

  // Click-to-refresh check
  if (el.getAttribute('onclick') || el.style.cursor === 'pointer') {
    score += 2;
  }
  const parent = el.parentElement;
  if (parent?.tagName === 'A') {
    const href = parent.getAttribute('href');
    if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
      score += 2;
    }
  }

  // Nearby input check
  const nearbyInput = findNearestInput(el);
  if (nearbyInput) {
    score += 1;
  }

  // Dynamic src check
  if (el instanceof HTMLImageElement && el.src) {
    if (/[?&](t|r|random|timestamp|_|v)=/i.test(el.src)) {
      score += 1;
    }
  }

  // Penalize if inside header/nav/footer
  const inLayoutArea = el.closest('header, nav, footer, [role="banner"], [role="navigation"]');
  if (inLayoutArea) {
    score -= 2;
  }

  return score;
}

export function findNearestInput(el: Element): HTMLInputElement | null {
  // Strategy 1: Same form
  const form = el.closest('form');
  if (form) {
    const inputs = form.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input:not([type])'
    );
    // Find input with captcha-related attributes
    for (const input of inputs) {
      const inputAttrs = [input.id, input.className, input.name, input.placeholder || '']
        .join(' ').toLowerCase();
      if (CAPTCHA_KEYWORDS.some(kw => inputAttrs.includes(kw))) {
        return input;
      }
    }
  }

  // Strategy 2: DOM proximity - siblings and nearby elements
  const parent = el.parentElement;
  if (parent) {
    const sibling = parent.querySelector<HTMLInputElement>(
      'input[type="text"], input:not([type])'
    );
    if (sibling) return sibling;
  }

  // Strategy 3: Visual distance within 200px
  const rect = el.getBoundingClientRect();
  const allInputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="text"], input:not([type])'
  );

  let closest: HTMLInputElement | null = null;
  let minDist = 200;

  for (const input of allInputs) {
    if (input.type === 'hidden') continue;
    const inputRect = input.getBoundingClientRect();
    const dist = Math.hypot(
      rect.left - inputRect.left,
      rect.top - inputRect.top
    );
    if (dist < minDist) {
      minDist = dist;
      closest = input;
    }
  }

  return closest;
}

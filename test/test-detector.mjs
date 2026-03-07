/**
 * Unit test for CAPTCHA detector scoring logic.
 * Runs in Node.js with jsdom to simulate DOM.
 */
import { JSDOM } from 'jsdom';

const CAPTCHA_KEYWORDS = [
  'captcha', 'verify', 'vcode', 'validcode', 'checkcode',
  'authcode', 'yanzhengma', 'yzm', 'verification', 'seccode',
  'imgcode', 'verifycode', 'validatecode', 'captchaimg',
];

const CAPTCHA_SIZE = { minWidth: 60, maxWidth: 300, minHeight: 20, maxHeight: 80 };

function scoreCaptcha(el, dom) {
  let score = 0;
  const w = parseInt(el.getAttribute('width') || '0');
  const h = parseInt(el.getAttribute('height') || '0');

  // Size check
  if (w >= CAPTCHA_SIZE.minWidth && w <= CAPTCHA_SIZE.maxWidth &&
      h >= CAPTCHA_SIZE.minHeight && h <= CAPTCHA_SIZE.maxHeight) {
    score += 2;
  }

  // Attribute keyword check
  const attrs = [
    el.getAttribute('src') || '',
    el.id || '',
    el.className || '',
    el.getAttribute('name') || '',
    el.getAttribute('alt') || '',
  ].join(' ').toLowerCase();

  if (CAPTCHA_KEYWORDS.some(kw => attrs.includes(kw))) {
    score += 3;
  }

  // Click-to-refresh check
  if (el.getAttribute('onclick') || el.style?.cursor === 'pointer') {
    score += 2;
  }
  const parent = el.parentElement;
  if (parent?.tagName === 'A') {
    const href = parent.getAttribute('href');
    if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
      score += 2;
    }
  }

  // Dynamic src check
  const src = el.getAttribute('src') || '';
  if (/[?&](t|r|random|timestamp|_|v)=/i.test(src)) {
    score += 1;
  }

  // Penalize if inside header/nav/footer
  if (el.closest('header, nav, footer')) {
    score -= 2;
  }

  // Nearby input (simplified: check same form)
  const form = el.closest('form');
  if (form && form.querySelector('input[type="text"], input:not([type])')) {
    score += 1;
  }

  return score;
}

// --- Tests ---
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('=== CAPTCHA Detector Unit Tests ===\n');

// Test 1: High-score CAPTCHA
test('High-score: captcha keyword + size + onclick + input = 8', () => {
  const dom = new JSDOM(`
    <form>
      <img class="captcha-img" onclick="refresh()" width="100" height="40" alt="captcha verification code">
      <input type="text" name="captcha">
    </form>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score >= 7, `Expected >= 7, got ${score}`);
});

// Test 2: Medium-score: keyword + size
test('Medium-score: keyword + size + input = 6', () => {
  const dom = new JSDOM(`
    <form>
      <img id="verifycode" width="120" height="40">
      <input type="text" name="vcode">
    </form>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score >= 5, `Expected >= 5, got ${score}`);
});

// Test 3: Logo in nav (should NOT be detected)
test('Logo in nav: penalized below threshold', () => {
  const dom = new JSDOM(`
    <nav>
      <img src="logo.png" width="200" height="100" alt="Company Logo">
    </nav>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score < 3, `Expected < 3, got ${score}`);
});

// Test 4: Dynamic src with refresh link
test('Dynamic src + link + keyword + size + input = 8+', () => {
  const dom = new JSDOM(`
    <form>
      <a href="javascript:void(0)">
        <img class="captcha" width="90" height="32" alt="Click to refresh captcha"
             src="getCaptcha?t=123456">
      </a>
      <input type="text" id="authcode">
    </form>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score >= 8, `Expected >= 8, got ${score}`);
});

// Test 5: Plain image, no captcha signals
test('Plain image: no signals = 0', () => {
  const dom = new JSDOM(`
    <div><img src="photo.jpg" width="400" height="300"></div>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score === 0, `Expected 0, got ${score}`);
});

// Test 6: Small icon (below min size)
test('Small icon: below min size = 0', () => {
  const dom = new JSDOM(`
    <div><img src="icon.png" width="16" height="16"></div>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score === 0, `Expected 0, got ${score}`);
});

// Test 7: Canvas element with captcha class
test('Canvas with captcha class: keyword(+3) + size(+2) = 5', () => {
  const dom = new JSDOM(`
    <form>
      <canvas class="captcha-canvas" width="120" height="40"></canvas>
      <input type="text" name="code">
    </form>
  `);
  const canvas = dom.window.document.querySelector('canvas');
  const score = scoreCaptcha(canvas, dom);
  assert(score >= 5, `Expected >= 5, got ${score}`);
});

// Test 8: Image in footer (penalized)
test('Image in footer: penalized', () => {
  const dom = new JSDOM(`
    <footer>
      <img src="badge.png" width="88" height="31">
    </footer>
  `);
  const img = dom.window.document.querySelector('img');
  const score = scoreCaptcha(img, dom);
  assert(score < 3, `Expected < 3, got ${score}`);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

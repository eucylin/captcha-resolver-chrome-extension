#!/usr/bin/env python3
"""
Trains the letter-case probe used by src/offscreen/caseDecoder.ts.

Why: ddddocr's common_old model was trained mostly on lowercase labels, so its
argmax outputs lowercase letters even for clearly uppercase glyphs. Its final
layer is linear (logits = h @ W + b, with h the 1024-d hidden state), and h
still encodes letter case, so a linear probe over the logits can recover it.

Steps:
  1. Render synthetic CAPTCHAs (random fonts, rotation, jitter, scale, noise,
     interference lines, sine warp, blur, inversion) with known labels.
  2. Run common_old.onnx with the hidden layer exposed as an extra output.
  3. Fit an L2-regularised logistic regression "is uppercase" on the hidden
     state at each letter's peak CTC frame (only CAPTCHAs whose
     case-insensitive reading is already correct).
  4. Map it to logit space (u = pinv(W) @ w) and write
     public/models/case_probe.bin: <classes> float32 weights + 1 float32 bias,
     little-endian.
  5. Report accuracy on CAPTCHAs rendered with held-out font families, using
     the same CAPTCHA-level case decision as caseDecoder.ts.

Usage (from the repo root, after `npm install`):
  python3 -m venv .venv-probe
  .venv-probe/bin/pip install -r scripts/case-probe/requirements.txt
  .venv-probe/bin/python scripts/case-probe/train_case_probe.py

Fonts default to the macOS system font folders; pass --fonts with one or more
glob patterns on other systems. Results depend on the fonts available.
"""
import argparse
import glob
import json
import math
import os
import random
import sys
import tempfile
import time

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODEL_DIR = os.path.join(REPO, 'node_modules', 'ddddocr-node', 'onnx')
MODEL = os.path.join(MODEL_DIR, 'common_old.onnx')
CHARSET = os.path.join(MODEL_DIR, 'common_old.json')
OUT = os.path.join(REPO, 'public', 'models', 'case_probe.bin')

HIDDEN = '380'   # input of the final (quantized) MatMul: [frames, 1, 1024]
LOGITS = '387'   # model output: [frames, 1, classes]

# Must match PRIOR_ALL_LOWER / PRIOR_ALL_UPPER in src/offscreen/caseDecoder.ts
PRIOR_ALL_LOWER = 0.4
PRIOR_ALL_UPPER = 0.3

DEFAULT_FONT_GLOBS = [
    '/System/Library/Fonts/*.tt[fc]',
    '/System/Library/Fonts/Supplemental/*.tt[fc]',
]
# Decorative, symbol and non-Latin fonts that are not useful for CAPTCHAs.
SKIP_FONTS = (
    'Webdings', 'Wingding', 'Symbol', 'Ornaments', 'Zapfino', 'Braille',
    'LastResort', 'Noto', 'STIX', 'Chancery', 'Brush Script', 'Snell',
    'Luminari', 'Trattatello', 'Phosphate', 'Bradley', 'Party', 'Herculanum',
    'Papyrus', 'Chalkduster', 'Farisi', 'Mishafi', 'Diwan', 'Kokonor',
    'Sinhala', 'Kannada', 'Gurmukhi', 'Tamil', 'Telugu', 'Malayalam', 'Oriya',
    'Bangla', 'Devanagari', 'Gujarati', 'Khmer', 'Lao', 'Myanmar', 'Tibetan',
    'Mshtakan', 'Ayuthaya', 'Silom', 'Sathu', 'Krungthep', 'Plantagenet',
    'Raanana', 'Corsiva', 'Kefa', 'Al ', 'Baghdad', 'Beirut', 'Damascus',
    'DecoType', 'KufiStandard', 'Nadeem', 'Sana', 'Waseem', 'Muna', 'Geeza',
    'Smallcaps', 'Didot', 'Marker', 'Skia', 'SignPainter', 'Savoye', 'Bodoni',
    'Microsoft Sans Serif',
)

LOWER = 'abcdefghijklmnopqrstuvwxyz'
UPPER = LOWER.upper()
DIGITS = '0123456789'


# ── Fonts ─────────────────────────────────────────────────────────

def load_fonts(patterns):
    files = sorted({f for p in patterns for f in glob.glob(p)})
    fonts = []
    for f in files:
        name = os.path.basename(f)
        if any(s in name for s in SKIP_FONTS):
            continue
        try:
            font = ImageFont.truetype(f, 40)
            x, cap, a = font.getbbox('x'), font.getbbox('X'), font.getbbox('A')
            # Needs Latin glyphs with distinct lowercase / uppercase heights.
            if (cap[3] - cap[1]) - (x[3] - x[1]) < 4 or a[2] - a[0] < 5:
                continue
            fonts.append(f)
        except Exception:
            pass
    return fonts


def font_family(path):
    return os.path.basename(path).split(' ')[0].split('.')[0].split('-')[0]


def split_fonts(fonts, seed=7):
    families = sorted({font_family(f) for f in fonts})
    random.Random(seed).shuffle(families)
    held_out = set(families[: len(families) // 4])
    train = [f for f in fonts if font_family(f) not in held_out]
    test = [f for f in fonts if font_family(f) in held_out]
    return train, test


# ── Synthetic CAPTCHAs ────────────────────────────────────────────

def random_text(rnd):
    mode = rnd.random()
    if mode < 0.45:
        pool = LOWER + UPPER + DIGITS
    elif mode < 0.65:
        pool = UPPER + DIGITS
    elif mode < 0.85:
        pool = LOWER + DIGITS
    elif mode < 0.93:
        pool = LOWER + UPPER
    else:
        pool = UPPER
    return ''.join(rnd.choice(pool) for _ in range(rnd.randint(4, 6)))


def render(text, rnd, fonts):
    W, H = rnd.randint(90, 180), rnd.randint(30, 60)
    if W / len(text) < H * 0.45:
        W = int(H * 0.5 * len(text)) + 10
    bg = tuple(rnd.randint(190, 255) for _ in range(3))
    img = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(img)
    if rnd.random() < 0.4:  # vertical gradient
        delta = rnd.choice([-40, 40])
        for y in range(H):
            c = tuple(max(0, min(255, bg[i] + int((y / H - 0.5) * delta))) for i in range(3))
            d.line([(0, y), (W, y)], fill=c)
    if rnd.random() < 0.3:  # light speckle background
        for _ in range(rnd.randint(50, 400)):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=tuple(rnd.randint(120, 255) for _ in range(3)))

    font = rnd.choice(fonts)
    per_char_font = rnd.random() < 0.25
    base = int(H * rnd.uniform(0.55, 0.8))
    rot = rnd.choice([0, 8, 15, 25, 35])
    jitter = rnd.choice([0, 0.03, 0.08, 0.15])
    scale_jitter = rnd.choice([0, 0, 0.08, 0.15])
    spacing = rnd.uniform(-0.12, 0.15)
    single_color = rnd.random() < 0.5
    color0 = tuple(rnd.randint(0, 110) for _ in range(3))

    glyphs = []
    for ch in text:
        path = rnd.choice(fonts) if per_char_font else font
        size = max(10, int(base * (1 + rnd.uniform(-scale_jitter, scale_jitter))))
        f = ImageFont.truetype(path, size)
        ascent, _ = f.getmetrics()
        layer = Image.new('RGBA', (size * 3, size * 3), (0, 0, 0, 0))
        color = color0 if single_color else tuple(rnd.randint(0, 130) for _ in range(3))
        # Baseline at y = 1.5 * size so case-dependent glyph heights are preserved.
        ImageDraw.Draw(layer).text((size, size * 1.5 - ascent), ch, font=f, fill=color + (255,))
        layer = layer.rotate(rnd.uniform(-rot, rot), resample=Image.BICUBIC, center=(size * 1.5, size * 1.5))
        glyphs.append((layer, size, f.getlength(ch)))

    total = sum(adv * (1 + spacing) for _, _, adv in glyphs)
    x = max(2, (W - total) / 2 + rnd.uniform(-4, 4))
    baseline = H * rnd.uniform(0.68, 0.8)
    for layer, size, adv in glyphs:
        y = baseline + rnd.uniform(-jitter, jitter) * H - size * 1.5
        img.paste(layer, (int(x - size), int(y)), layer)
        x += adv * (1 + spacing)

    d = ImageDraw.Draw(img)
    for _ in range(rnd.choice([0, 1, 2, 3, 5])):  # interference lines / arcs
        c = tuple(rnd.randint(0, 200) for _ in range(3))
        width = rnd.choice([1, 1, 2, 3])
        if rnd.random() < 0.5:
            d.line([(rnd.randint(0, W), rnd.randint(0, H)), (rnd.randint(0, W), rnd.randint(0, H))], fill=c, width=width)
        else:
            x0, y0 = rnd.randint(-W // 2, W // 2), rnd.randint(-H, H // 2)
            box = [x0, y0, x0 + rnd.randint(W // 2, W * 2), y0 + rnd.randint(H, H * 3)]
            d.arc(box, rnd.randint(0, 360), rnd.randint(0, 360), fill=c, width=width)
    for _ in range(rnd.choice([0, 30, 150])):  # noise dots
        d.point((rnd.randrange(W), rnd.randrange(H)), fill=tuple(rnd.randint(0, 255) for _ in range(3)))
    if rnd.random() < 0.25:  # sine warp
        a = np.asarray(img)
        amp, period, phase = rnd.uniform(1, H * 0.08), rnd.uniform(W * 0.3, W * 1.2), rnd.uniform(0, 6.3)
        out = np.empty_like(a)
        for col in range(W):
            out[:, col] = np.roll(a[:, col], int(round(amp * math.sin(2 * math.pi * col / period + phase))), axis=0)
        img = Image.fromarray(out)
    if rnd.random() < 0.15:
        img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.4, 1.0)))
    if rnd.random() < 0.07:
        img = Image.fromarray(255 - np.asarray(img))
    return img


# ── Model ─────────────────────────────────────────────────────────

def preprocess(img):
    """ddddocr preprocessing: 64px height, greyscale, normalise to [-1, 1]."""
    w, h = img.size
    tw = max(1, int(w * 64 / h))
    a = np.asarray(img.resize((tw, 64), Image.BILINEAR).convert('L'), dtype=np.float32) / 255.0
    return ((a - 0.5) / 0.5)[None, None]


def load_model():
    model = onnx.load(MODEL)
    model.graph.output.append(onnx.helper.make_tensor_value_info(HIDDEN, onnx.TensorProto.FLOAT, None))
    tmp = os.path.join(tempfile.mkdtemp(), 'common_old_hidden.onnx')
    onnx.save(model, tmp)
    ort.set_default_logger_severity(3)
    session = ort.InferenceSession(tmp)

    init = {i.name: numpy_helper.to_array(i) for i in model.graph.initializer}
    q = init['135_quantized'].astype(np.float64)
    zero = init['135_zero_point'].astype(np.float64)
    scale = init['135_scale'].astype(np.float64)
    W = (q - zero) * scale                  # [1024, classes], dequantized
    b = init['136'].astype(np.float64)      # [classes]
    return session, W, b


def run(session, img):
    """Returns per-character (char, hidden at peak frame, logits at peak frame)."""
    logits, hidden = session.run([LOGITS, HIDDEN], {'input1': preprocess(img)})
    logits = logits.reshape(logits.shape[0], -1)
    hidden = hidden.reshape(hidden.shape[0], -1)
    best = logits.argmax(1)
    segments, last, start = [], 0, 0
    for t, cls in enumerate(best):
        if cls != last:
            if last != 0:
                segments.append((last, start, t))
            start = t
        last = cls
    if last != 0:
        segments.append((last, start, len(best)))
    out = []
    for cls, s, e in segments:
        peak = s + int(np.argmax(logits[s:e, cls]))
        out.append((int(cls), hidden[peak].astype(np.float32), logits[peak].astype(np.float32)))
    return out


def build_set(session, charset, fonts, n, seed, label):
    rnd = random.Random(seed)
    samples, t0 = [], time.time()
    for k in range(n):
        text = random_text(rnd)
        chars = [(charset[c], h, lg) for c, h, lg in run(session, render(text, rnd, fonts))]
        samples.append((text, chars))
        if (k + 1) % 2000 == 0:
            print(f'  {label}: {k + 1}/{n} ({time.time() - t0:.0f}s)', flush=True)
    return samples


# ── Probe ─────────────────────────────────────────────────────────

def is_letter(c):
    return len(c) == 1 and c.isascii() and c.isalpha()


def letter_rows(samples):
    X, y = [], []
    for text, chars in samples:
        if ''.join(c for c, _, _ in chars).lower() != text.lower():
            continue
        for (c, h, _), truth in zip(chars, text):
            if is_letter(c):
                X.append(h)
                y.append(1.0 if truth.isupper() else 0.0)
    return np.array(X, dtype=np.float64), np.array(y)


def fit_logistic(X, y, l2, iters=25):
    """L2-regularised logistic regression via Newton's method on standardised features."""
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Z = np.hstack([(X - mu) / sd, np.ones((len(X), 1))])
    n, d = Z.shape
    reg = np.full(d, 2 * l2 * n)
    reg[-1] = 0  # no penalty on the bias
    beta = np.zeros(d)
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(Z @ beta)))
        grad = Z.T @ (p - y) + reg * beta
        hess = (Z * (p * (1 - p))[:, None]).T @ Z + np.diag(reg)
        step = np.linalg.solve(hess, grad)
        beta -= step
        if np.abs(step).max() < 1e-8:
            break
    w = beta[:-1] / sd
    return w, beta[-1] - w @ mu


def to_logit_space(w, c, W, b):
    """v·h == u·(logits − b) for logits = h @ W + b, with u = pinv(W) @ w."""
    u = np.linalg.pinv(W) @ w
    return u, c - b @ u


# ── Evaluation (mirrors caseDecoder.ts) ───────────────────────────

def log_sigmoid(x):
    return -np.logaddexp(0, -x)


def apply_case(chars, scores):
    zs = np.array([z for z in scores if z is not None])
    if len(zs) == 0:
        return ''.join(chars)
    lower = math.log(PRIOR_ALL_LOWER) + log_sigmoid(-zs).sum()
    upper = math.log(PRIOR_ALL_UPPER) + log_sigmoid(zs).sum()
    mixed = math.log(1 - PRIOR_ALL_LOWER - PRIOR_ALL_UPPER) + len(zs) * math.log(0.5)
    mode = 'upper' if upper > lower and upper > mixed else 'mixed' if mixed > lower else 'lower'
    out = []
    for c, z in zip(chars, scores):
        if z is None:
            out.append(c)
        else:
            up = mode == 'upper' or (mode == 'mixed' and z > 0)
            out.append(c.upper() if up else c.lower())
    return ''.join(out)


def category(text):
    if not any(c.isalpha() for c in text):
        return 'digits'
    return 'lower' if text == text.lower() else 'upper' if text == text.upper() else 'mixed'


def evaluate(samples, u, c):
    stats = {}
    for text, chars in samples:
        raw = ''.join(ch for ch, _, _ in chars)
        scores = [float(lg @ u + c) if is_letter(ch) else None for ch, _, lg in chars]
        out = apply_case([ch for ch, _, _ in chars], scores)
        s = stats.setdefault(category(text), [0, 0, 0, 0])
        s[0] += 1
        s[1] += raw == text
        s[2] += out == text
        s[3] += raw.lower() == text.lower()
    print('  category  count  raw-exact  case-recovered  case-insensitive (ceiling)')
    for k in ('lower', 'upper', 'mixed'):
        if k in stats:
            n, raw, out, ci = stats[k]
            print(f'  {k:8s}  {n:5d}  {raw / n:9.3f}  {out / n:14.3f}  {ci / n:10.3f}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fonts', nargs='+', default=DEFAULT_FONT_GLOBS, help='font file glob patterns')
    ap.add_argument('--train', type=int, default=8000, help='training CAPTCHAs')
    ap.add_argument('--test', type=int, default=2000, help='held-out-font CAPTCHAs for evaluation')
    ap.add_argument('--l2', type=float, default=0.01, help='L2 penalty (on standardised features)')
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()

    fonts = load_fonts(args.fonts)
    if len(fonts) < 8:
        sys.exit(f'Only {len(fonts)} usable fonts found; pass --fonts with more font files.')
    train_fonts, test_fonts = split_fonts(fonts)
    print(f'Fonts: {len(train_fonts)} train, {len(test_fonts)} held out')

    charset = json.load(open(CHARSET, encoding='utf-8'))
    session, W, b = load_model()
    if W.shape[1] != len(charset):
        sys.exit(f'Model has {W.shape[1]} classes but charset has {len(charset)}')

    print('Rendering and running the model...')
    train = build_set(session, charset, train_fonts, args.train, 123, 'train')
    test = build_set(session, charset, test_fonts, args.test, 999, 'test')

    X, y = letter_rows(train)
    print(f'Fitting probe on {len(y)} letters ({y.mean():.0%} uppercase)')
    w, c = fit_logistic(X, y, args.l2)
    u, c2 = to_logit_space(w, c, W, b)

    probe = np.concatenate([u, [c2]]).astype('<f4')
    probe.tofile(args.out)
    print(f'Wrote {args.out} ({probe.nbytes} bytes)')

    print('Held-out fonts (exact match rate):')
    evaluate(test, probe[:-1].astype(np.float64), float(probe[-1]))


if __name__ == '__main__':
    main()

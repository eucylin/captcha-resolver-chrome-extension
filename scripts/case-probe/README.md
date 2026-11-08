# Case probe

`public/models/case_probe.bin` lets the extension output letters in the same
case as the CAPTCHA image. This folder holds the script that produces it.

## Why it exists

ddddocr's `common_old` model was trained mostly on lowercase labels, so on its
own it outputs lowercase letters even for clearly uppercase glyphs (about 1 in
10 uppercase letters come out uppercase on synthetic tests). The model's final
layer is linear (`logits = h·W + b`), and its 1024-d hidden state `h` still
encodes letter case. A logistic regression on `h` is equivalent to one on the
logits, so the probe ships as one weight per output class plus a bias
(8,211 float32 values, 32 KB) and needs no change to the model.

At runtime `src/offscreen/caseDecoder.ts` scores each decoded letter with the
probe, then picks between "all lowercase", "all uppercase" and "mixed" for the
whole CAPTCHA, so that lowercase CAPTCHAs stay as accurate as before.

## Regenerating

Retrain whenever the OCR model changes (the probe only fits `common_old.onnx`).

```bash
npm install
python3 -m venv .venv-probe
.venv-probe/bin/pip install -r scripts/case-probe/requirements.txt
.venv-probe/bin/python scripts/case-probe/train_case_probe.py
node test/test-case-decoder.mjs
```

The script renders synthetic CAPTCHAs with system fonts (macOS font folders by
default; use `--fonts '<glob>' ...` elsewhere), trains on three quarters of
the font families and reports accuracy on the held-out quarter. Takes about
3 minutes on an Apple Silicon laptop.

If you change the case priors in `caseDecoder.ts`, change `PRIOR_ALL_LOWER` /
`PRIOR_ALL_UPPER` in the script too so its evaluation matches the extension.

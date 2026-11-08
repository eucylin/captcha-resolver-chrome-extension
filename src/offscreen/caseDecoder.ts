/**
 * CTC decoding with letter-case recovery for the ddddocr `common_old` model.
 *
 * The model was trained mostly on lowercase labels, so its argmax almost
 * always yields lowercase letters, even for clearly uppercase glyphs. The
 * case information is still present in the model's hidden state, and the
 * final layer is linear (logits = W·h + b), so a linear probe over a frame's
 * logits recovers it. The probe weights are trained offline on synthetic
 * CAPTCHAs (see scripts/case-probe/) and are only valid for `common_old.onnx`.
 *
 * Per-letter probe scores are then combined with a CAPTCHA-level prior that
 * favours consistent all-lowercase / all-uppercase readings, so lowercase
 * CAPTCHAs (the model's existing strength) do not regress.
 *
 * Pure module: no Chrome or DOM APIs, so it can be unit-tested in Node.
 */

export interface CaseProbe {
  /** One weight per output class (logit dimension). */
  weights: Float32Array;
  bias: number;
}

// Prior probabilities of the CAPTCHA-level case hypotheses. Tuned on a
// held-out synthetic set to keep all-lowercase accuracy within ~2% of the
// raw model output while recovering most uppercase and mixed-case letters.
const PRIOR_ALL_LOWER = 0.4;
const PRIOR_ALL_UPPER = 0.3;
const PRIOR_MIXED = 1 - PRIOR_ALL_LOWER - PRIOR_ALL_UPPER;

const BLANK = 0;

interface DecodedChar {
  char: string;
  /** Probe score (log-odds of uppercase); null for non-letters. */
  upperLogit: number | null;
}

function isAsciiLetter(ch: string): boolean {
  return ch.length === 1 && /[A-Za-z]/.test(ch);
}

/** log(sigmoid(x)), numerically stable. */
function logSigmoid(x: number): number {
  return x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x));
}

function argmaxRow(logits: Float32Array, offset: number, classes: number): number {
  let best = 0;
  let bestVal = logits[offset];
  for (let k = 1; k < classes; k++) {
    const v = logits[offset + k];
    if (v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

function probeScore(
  logits: Float32Array,
  offset: number,
  classes: number,
  probe: CaseProbe
): number {
  let z = probe.bias;
  const w = probe.weights;
  for (let k = 0; k < classes; k++) z += w[k] * logits[offset + k];
  return z;
}

/**
 * Greedy CTC decode. Each emitted character keeps the probe score of the
 * frame where its class logit peaks.
 */
function ctcDecode(
  logits: Float32Array,
  frames: number,
  classes: number,
  charset: readonly string[],
  probe: CaseProbe | null
): DecodedChar[] {
  const out: DecodedChar[] = [];
  let last = BLANK;
  let peakFrame = -1;
  let peakVal = -Infinity;

  const flush = () => {
    if (last === BLANK) return;
    const char = charset[last] ?? '';
    if (!char) return;
    const upperLogit =
      probe && isAsciiLetter(char)
        ? probeScore(logits, peakFrame * classes, classes, probe)
        : null;
    out.push({ char, upperLogit });
  };

  for (let t = 0; t < frames; t++) {
    const offset = t * classes;
    const cls = argmaxRow(logits, offset, classes);
    if (cls !== last) {
      flush();
      last = cls;
      peakVal = -Infinity;
    }
    if (cls !== BLANK && logits[offset + cls] > peakVal) {
      peakVal = logits[offset + cls];
      peakFrame = t;
    }
  }
  flush();
  return out;
}

/**
 * Picks the letter case for each decoded character by comparing three
 * hypotheses: all lowercase, all uppercase, or mixed (each letter decided
 * independently by its probe score).
 */
function applyCase(chars: DecodedChar[]): string {
  const scores = chars
    .map(c => c.upperLogit)
    .filter((z): z is number => z !== null);
  if (scores.length === 0) return chars.map(c => c.char).join('');

  let allLower = Math.log(PRIOR_ALL_LOWER);
  let allUpper = Math.log(PRIOR_ALL_UPPER);
  for (const z of scores) {
    allLower += logSigmoid(-z);
    allUpper += logSigmoid(z);
  }
  // Under "mixed", each letter is upper/lower with equal prior probability.
  const mixed = Math.log(PRIOR_MIXED) + scores.length * Math.log(0.5);

  const mode =
    allUpper > allLower && allUpper > mixed
      ? 'upper'
      : mixed > allLower
        ? 'mixed'
        : 'lower';

  return chars
    .map(({ char, upperLogit }) => {
      if (upperLogit === null) return char;
      const upper = mode === 'upper' || (mode === 'mixed' && upperLogit > 0);
      return upper ? char.toUpperCase() : char.toLowerCase();
    })
    .join('');
}

/**
 * Decodes raw model output (shape [frames, 1, classes], row-major) into text.
 * Without a probe, returns exactly what the model's argmax produces.
 */
export function decodeWithCase(
  logits: Float32Array,
  frames: number,
  classes: number,
  charset: readonly string[],
  probe: CaseProbe | null
): string {
  const chars = ctcDecode(logits, frames, classes, charset, probe);
  return probe ? applyCase(chars) : chars.map(c => c.char).join('');
}

/** Parses the probe file: `classes` little-endian float32 weights, then the bias. */
export function parseCaseProbe(buffer: ArrayBuffer, classes: number): CaseProbe | null {
  if (buffer.byteLength !== (classes + 1) * 4) return null;
  const view = new DataView(buffer);
  const weights = new Float32Array(classes);
  for (let k = 0; k < classes; k++) weights[k] = view.getFloat32(k * 4, true);
  return { weights, bias: view.getFloat32(classes * 4, true) };
}

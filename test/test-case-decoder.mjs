/**
 * Tests for letter-case recovery (src/offscreen/caseDecoder.ts).
 *
 * 1. Unit tests on hand-built logits (decoding + case-hypothesis logic).
 * 2. End-to-end: the real common_old model + case probe on fixture CAPTCHAs,
 *    using the same preprocessing and runtime (onnxruntime-web) as the
 *    offscreen document.
 *
 * Run: node test/test-case-decoder.mjs
 */
import fs from 'fs';
import ts from 'typescript';
import * as ort from 'onnxruntime-web';
import { Jimp } from 'jimp';

const root = new URL('..', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root));

// caseDecoder.ts has no imports, so it can be transpiled and loaded directly.
const decoderJs = ts.transpileModule(read('src/offscreen/caseDecoder.ts').toString(), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { decodeWithCase, parseCaseProbe } = await import(
  'data:text/javascript;base64,' + Buffer.from(decoderJs).toString('base64')
);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}expected "${expected}", got "${actual}"`);
  }
}

// ── 1. Unit tests ────────────────────────────────────────────────
//
// Toy model: classes = ['', 'a', 'b', '7', <case signal>]. The last class is
// never the argmax; the toy probe reads it as the uppercase log-odds.
const CHARSET = ['', 'a', 'b', '7', '#'];
const CLASSES = CHARSET.length;
const probe = { weights: new Float32Array([0, 0, 0, 0, 1]), bias: 0 };

/** frames: [[classIndex, caseSignal], ...] */
function buildLogits(frames) {
  const logits = new Float32Array(frames.length * CLASSES).fill(-10);
  frames.forEach(([cls, signal], t) => {
    logits[t * CLASSES + cls] = 10;
    logits[t * CLASSES + 4] = signal;
  });
  return logits;
}

function decode(frames, p = probe) {
  return decodeWithCase(buildLogits(frames), frames.length, CLASSES, CHARSET, p);
}

console.log('=== Case Decoder Unit Tests ===\n');

await test('CTC collapses repeats and drops blanks', () => {
  assertEqual(decode([[1, -5], [1, -5], [0, 0], [1, -5], [2, -5], [2, -5], [0, 0]]), 'aab');
});

await test('Without a probe, returns raw model output', () => {
  assertEqual(decode([[1, 5], [2, 5], [3, 5]], null), 'ab7');
});

await test('Confident uppercase letters become uppercase', () => {
  assertEqual(decode([[1, 4], [0, 0], [2, 4], [3, 0], [1, 4]]), 'AB7A');
});

await test('One weak uppercase vote does not break an all-lowercase reading', () => {
  assertEqual(decode([[1, -4], [0, 0], [2, -4], [0, 0], [1, 0.8], [0, 0], [2, -4]]), 'abab');
});

await test('Strong opposite signals give a mixed-case reading', () => {
  assertEqual(decode([[1, 5], [0, 0], [2, -5], [0, 0], [1, 5], [0, 0], [2, -5]]), 'AbAb');
});

await test('Uses the score at the frame where the character peaks', () => {
  const logits = buildLogits([[1, -6], [1, 6], [1, -6]]);
  logits[1 * CLASSES + 1] = 12; // middle frame is the peak
  assertEqual(decodeWithCase(logits, 3, CLASSES, CHARSET, probe), 'A');
});

await test('Digits-only output is unchanged', () => {
  assertEqual(decode([[3, 9], [0, 0], [3, -9]]), '77');
});

await test('parseCaseProbe rejects a probe of the wrong size', () => {
  assertEqual(parseCaseProbe(new ArrayBuffer(4 * 3), CLASSES), null);
});

await test('parseCaseProbe reads little-endian weights and bias', () => {
  const view = new DataView(new ArrayBuffer(4 * (CLASSES + 1)));
  view.setFloat32(4 * 4, 1.5, true);
  view.setFloat32(4 * CLASSES, -2, true);
  const parsed = parseCaseProbe(view.buffer, CLASSES);
  assertEqual(parsed.weights[4], 1.5);
  assertEqual(parsed.bias, -2);
});

// ── 2. End-to-end on fixture CAPTCHAs ────────────────────────────

console.log('\n=== Case Recovery End-to-End (common_old + case probe) ===\n');

const charset = JSON.parse(read('node_modules/ddddocr-node/onnx/common_old.json'));
const session = await ort.InferenceSession.create(
  read('node_modules/ddddocr-node/onnx/common_old.onnx'),
  { logSeverityLevel: 4 }
);
const probeBuf = read('public/models/case_probe.bin');
const realProbe = parseCaseProbe(
  probeBuf.buffer.slice(probeBuf.byteOffset, probeBuf.byteOffset + probeBuf.byteLength),
  charset.length
);

await test('Case probe matches the model output size', () => {
  if (!realProbe) throw new Error(`probe size does not match ${charset.length} classes`);
});

// Mirrors preprocess() in src/offscreen/ocrEngine.ts
async function runModel(file) {
  const image = await Jimp.read(file);
  const w = Math.max(1, Math.floor(image.bitmap.width * (64 / image.bitmap.height)));
  image.resize({ w, h: 64 });
  image.greyscale();
  const px = image.bitmap.data;
  const data = new Float32Array(w * 64);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) data[j] = (px[i] / 255 - 0.5) / 0.5;
  const out = (await session.run({ input1: new ort.Tensor('float32', data, [1, 1, 64, w]) }))['387'];
  return { logits: out.data, frames: out.dims[0], classes: out.dims[2] };
}

const fixtureDir = 'test/fixtures/case/';
const labels = JSON.parse(read(fixtureDir + 'labels.json'));
let rawExact = 0;
for (const [file, expected] of Object.entries(labels)) {
  const { logits, frames, classes } = await runModel(new URL(fixtureDir + file, root).pathname);
  const raw = decodeWithCase(logits, frames, classes, charset, null);
  if (raw === expected) rawExact++;
  await test(`${file}: "${expected}" (raw model: "${raw}")`, () => {
    assertEqual(decodeWithCase(logits, frames, classes, charset, realProbe), expected);
  });
}
console.log(`\n  Raw model output matched ${rawExact}/${Object.keys(labels).length} fixtures exactly`);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

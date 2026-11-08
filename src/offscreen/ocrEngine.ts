import type { InferenceSession, Tensor } from 'onnxruntime-web';
import { OcrRequest, OcrResponse } from '../shared/messages';
import { CaseProbe, decodeWithCase, parseCaseProbe } from './caseDecoder';

// ddddocr's default ("old") OCR model. The case probe is trained against this
// exact model, so both must change together.
const MODEL_FILE = 'models/common_old.onnx';
const CHARSET_FILE = 'models/common_old.json';
const CASE_PROBE_FILE = 'models/case_probe.bin';

const INPUT_HEIGHT = 64;
const INPUT_NAME = 'input1';
const OUTPUT_NAME = '387';

interface Engine {
  ort: typeof import('onnxruntime-web');
  session: InferenceSession;
  charset: string[];
  caseProbe: CaseProbe | null;
}

let enginePromise: Promise<Engine> | null = null;

async function fetchResource(path: string): Promise<Response> {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${path}`);
  return response;
}

async function loadCaseProbe(classes: number): Promise<CaseProbe | null> {
  try {
    const buffer = await (await fetchResource(CASE_PROBE_FILE)).arrayBuffer();
    const probe = parseCaseProbe(buffer, classes);
    if (!probe) console.warn('[CAPTCHA Solver] Case probe does not match model; case recovery disabled');
    return probe;
  } catch (err) {
    console.warn('[CAPTCHA Solver] Case probe unavailable; case recovery disabled:', err);
    return null;
  }
}

async function createEngine(): Promise<Engine> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = chrome.runtime.getURL('wasm/');

  const [modelBuffer, charset] = await Promise.all([
    fetchResource(MODEL_FILE).then(r => r.arrayBuffer()),
    fetchResource(CHARSET_FILE).then(r => r.json() as Promise<string[]>),
  ]);
  const session = await ort.InferenceSession.create(modelBuffer, { logSeverityLevel: 4 });
  const caseProbe = await loadCaseProbe(charset.length);

  console.log('[CAPTCHA Solver] OCR engine initialized');
  return { ort, session, charset, caseProbe };
}

function getEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = createEngine().catch(err => {
      console.error('[CAPTCHA Solver] OCR init failed:', err);
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

/**
 * Same preprocessing as ddddocr: scale to 64px height, greyscale,
 * normalise to [-1, 1].
 */
async function preprocess(imageData: string): Promise<{ data: Float32Array; width: number }> {
  const { Jimp } = await import('jimp');
  const image = await Jimp.read(imageData);
  const { width, height } = image.bitmap;
  const targetWidth = Math.max(1, Math.floor(width * (INPUT_HEIGHT / height)));
  image.resize({ w: targetWidth, h: INPUT_HEIGHT });
  image.greyscale();

  const pixels = image.bitmap.data;
  const data = new Float32Array(targetWidth * INPUT_HEIGHT);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    data[j] = (pixels[i] / 255 - 0.5) / 0.5;
  }
  return { data, width: targetWidth };
}

async function recognize(imageData: string): Promise<string> {
  const engine = await getEngine();
  const { data, width } = await preprocess(imageData);

  const input = new engine.ort.Tensor('float32', data, [1, 1, INPUT_HEIGHT, width]);
  const results = await engine.session.run({ [INPUT_NAME]: input });
  const output: Tensor = results[OUTPUT_NAME];

  // Output shape: [frames, 1, classes]
  const frames = output.dims[0];
  const classes = output.dims[output.dims.length - 1];
  return decodeWithCase(
    output.data as Float32Array,
    frames,
    classes,
    engine.charset,
    engine.caseProbe
  );
}

chrome.runtime.onMessage.addListener(
  (message: OcrRequest, _sender, sendResponse: (response: OcrResponse) => void) => {
    if (message.type !== 'OCR_REQUEST') return false;

    recognize(message.imageData)
      .then(text => sendResponse({ type: 'OCR_RESPONSE', text }))
      .catch(err => sendResponse({ type: 'OCR_RESPONSE', error: String(err) }));

    return true; // async response
  }
);

console.log('[CAPTCHA Solver] Offscreen document loaded');

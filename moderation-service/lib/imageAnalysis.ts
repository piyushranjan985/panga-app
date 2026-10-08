/**
 * The ML inference core of findmyvybe-app's photo moderation, extracted
 * into its own service. This is a straight move, not a rewrite, of what
 * used to be the body of the root app's
 * lib/safety/imageModeration.ts's selfHostedImageModerationProvider --
 * see ../../docs/MODERATION_SERVICE.md for why this got extracted and
 * what deliberately did NOT move (the APPROVED/REJECTED/MANUAL_REVIEW
 * policy decision, every DB write, and the Photo/ModerationCase models
 * all stay in the main app -- this service only ever returns raw
 * signals, never a decision).
 *
 * No database here, and no Prisma -- this file doesn't know what a
 * Photo or a User is. It takes bytes, returns numbers.
 */

export interface ModerationSignals {
  faceCount: number;
  nudityScores: {
    porn: number;
    hentai: number;
    sexy: number;
  };
}

/**
 * Thrown specifically when the input bytes can't be decoded as an image
 * at all (corrupt file, or a format neither sharp nor heic-convert
 * understands) -- as opposed to every other failure mode (models not
 * loaded, a tensor op failing), which means "this service's own infra is
 * broken." api/analyze.ts maps this one to HTTP 422, everything else to
 * 500, so the main app's remoteImageModerationProvider (see
 * lib/safety/imageModeration.ts there) can tell them apart exactly the
 * way it already does for the in-process self-hosted provider.
 */
export class UndecodableImageError extends Error {}

/**
 * ISOBMFF ("ftyp" box) sniff for HEIC/HEIF -- the same check the
 * `file-type` npm package and most format sniffers use. HEIC containers
 * share MP4's container format, so this can't be a simple magic-byte
 * prefix check the way PNG/JPEG are; it has to look at the brand tag
 * inside the ftyp box.
 */
export function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12);
  return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand);
}

/**
 * Decodes any common photo format (JPEG, PNG, WebP, GIF, AVIF, TIFF via
 * sharp; HEIC/HEIF via heic-convert -> sharp) into a flat, alpha-free RGB
 * pixel buffer plus dimensions. `.rotate()` with no arguments applies and
 * then strips any EXIF orientation tag -- phone photos are very commonly
 * stored "sideways" with a rotation flag rather than pre-rotated pixels,
 * which would otherwise make face detection fail on a perfectly normal
 * portrait photo.
 */
async function decodeToRgb(
  buffer: Buffer,
  sharp: (input: Buffer) => {
    rotate: () => ReturnType<typeof sharp>;
    removeAlpha: () => ReturnType<typeof sharp>;
    toColourspace: (name: string) => ReturnType<typeof sharp>;
    raw: () => ReturnType<typeof sharp>;
    toBuffer: (opts: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number } }>;
  },
  heicConvert: (opts: { buffer: Buffer; format: string; quality: number }) => Promise<ArrayBuffer>,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  let working = buffer;

  if (isHeic(buffer)) {
    try {
      working = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 0.92 }));
    } catch (err) {
      throw new UndecodableImageError(`HEIC decode failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  try {
    const { data, info } = await sharp(working)
      .rotate()
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  } catch (err) {
    throw new UndecodableImageError(`Image decode failed: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Real, $0 analysis: nsfwjs (nudity/explicit classification) +
 * @vladmandic/face-api (face detection), both self-hosted, both MIT
 * licensed, both running on plain @tensorflow/tfjs (pure JavaScript, no
 * native bindings) -- same stack, same decode strategy, same WASM-
 * backend workaround as the code this was moved from. See that file's
 * (lib/safety/imageModeration.ts in the main app) DECODE HISTORY comment
 * for why `canvas` and a hand-rolled JPEG/PNG-only decoder were both
 * tried and rejected before landing on sharp + heic-convert.
 */
export async function analyzeImage(imageBuffer: Buffer): Promise<ModerationSignals> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  // @ts-ignore
  const nsfwjs: any = await import('nsfwjs');
  // @vladmandic/face-api's package.json `main` field points at
  // dist/face-api.node.js unconditionally -- that build hard-requires
  // @tensorflow/tfjs-node (a 100MB+ native binary this service
  // deliberately never installs, for the same Vercel function-size
  // reason as the main app). dist/face-api.node-wasm.js is the
  // package's own purpose-built alternative: Node + the pure-npm
  // @tensorflow/tfjs-backend-wasm package instead, no native binary at
  // all. Importing that file directly, bypassing `main` entirely, is
  // what actually avoids it.
  // @ts-ignore
  const faceapiModule: any = await import('@vladmandic/face-api/dist/face-api.node-wasm.js');
  // That file is CommonJS (`module.exports = ...`), and this package has
  // no "exports" map for cjs-module-lexer to synthesize named ESM
  // exports from reliably -- so `.default` (Node's ESM/CJS interop) is
  // the one path guaranteed to hold the real module.exports object;
  // unwrap defensively in case a future version of the package changes
  // this.
  const faceapi: any = faceapiModule.default ?? faceapiModule;
  // @ts-ignore
  const tf: any = await import('@tensorflow/tfjs');
  // @ts-ignore
  const sharp: any = (await import('sharp')).default;
  // @ts-ignore
  const heicConvert: any = (await import('heic-convert')).default;

  // face-api.node-wasm.js's own `require("@tensorflow/tfjs-backend-wasm")`
  // registers the WASM backend factory with tf's global engine as a
  // side effect -- but registering a backend and ACTIVATING it are
  // different steps. setBackend no-ops once 'wasm' is already active
  // (true on warm serverless invocations, same module-scope reuse as the
  // isLoaded guard below), so calling this unconditionally on every
  // request is cheap.
  await tf.setBackend('wasm');
  await tf.ready();

  const { data: rgb, width, height } = await decodeToRgb(imageBuffer, sharp, heicConvert);

  const modelPath = process.env.FACE_API_MODEL_PATH || './public/models/face-api';
  // Guarded, not reloaded every call: loadFromDisk re-reads the ~6MB
  // model weight files from disk every time it's called, and a
  // serverless function reuses its module scope (and this loaded state)
  // across warm invocations, so this both saves real I/O per request and
  // matches the exact pattern the main app's provider used before this
  // moved.
  if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    } catch (err) {
      throw new Error(
        `[imageAnalysis] face-api model files not found at "${modelPath}" -- either ` +
          `scripts/download-face-api-models.mjs didn't run before this deploy, or they were traced out of ` +
          `this function's bundle. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const imageTensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
  try {
    const [nsfwModel, faceDetections] = await Promise.all([nsfwjs.load(), faceapi.detectAllFaces(imageTensor)]);
    const nsfwPredictions = await nsfwModel.classify(imageTensor);
    const scoreFor = (className: string) =>
      nsfwPredictions.find((p: { className: string; probability: number }) => p.className === className)
        ?.probability ?? 0;

    return {
      faceCount: faceDetections.length,
      nudityScores: {
        porn: scoreFor('Porn'),
        hentai: scoreFor('Hentai'),
        sexy: scoreFor('Sexy'),
      },
    };
  } finally {
    imageTensor.dispose();
  }
}

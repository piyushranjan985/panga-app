import type { ModerationSignals } from './policyEngine';

/**
 * Provider-agnostic image analysis. Swapping providers (self-hosted ->
 * a paid vendor later, if ever) means writing one new class here and
 * flipping IMAGE_MODERATION_PROVIDER -- nothing else in the app changes.
 * See docs/IDENTITY_VERIFICATION_AND_SAFETY.md sections 1, 3.
 *
 * No `verifiedFaceEmbedding` option here -- selfie-vs-ID face matching was
 * descoped, see the note at the top of policyEngine.ts.
 */
export interface ImageModerationProvider {
  readonly name: string;
  readonly modelVersion: string;
  analyze(imageBuffer: Buffer): Promise<ModerationSignals>;
}

/**
 * Thrown specifically when the input bytes can't be decoded as an image
 * at all (corrupt file, or a format neither sharp nor heic-convert
 * understands) -- as opposed to every other failure mode below (models
 * not loaded, tensor op failed), which means "our infra is broken, a
 * human should look." moderateAndUpload.ts treats this one differently:
 * REJECTED outright, not MANUAL_REVIEW, because there's nothing for a
 * human reviewer to look AT. See that file's catch block.
 */
export class UndecodableImageError extends Error {}

/**
 * Deterministic, dependency-free provider for local dev and automated
 * tests. Assumes a clean single-face photo so the upload -> moderation ->
 * Photo pipeline is exercisable end-to-end without any ML dependencies
 * installed. Mirrors the existing VERIFICATION_PROVIDER=mock convention in
 * lib/safety/identityVerification.ts.
 */
export const mockImageModerationProvider: ImageModerationProvider = {
  name: 'mock',
  modelVersion: 'mock-1',
  async analyze(_imageBuffer) {
    return {
      faceCount: 1,
      nudityScores: { porn: 0, hentai: 0, sexy: 0 },
    };
  },
};

/**
 * Real, $0 provider: nsfwjs (nudity/explicit classification) +
 * @vladmandic/face-api (face detection), both self-hosted, both MIT
 * licensed, both running on plain @tensorflow/tfjs (pure JavaScript, no
 * native bindings).
 *
 * DECODE HISTORY, both corrections kept here rather than erased, because
 * the reasoning matters for the next format that comes up:
 *
 *  1. First version used `canvas` (node-canvas) to decode images. That
 *     broke a real Vercel deploy outright -- `npm install` failed
 *     building canvas's native addon (`Package pixman-1 was not found`,
 *     no prebuilt binary for that Node ABI). Removed entirely.
 *  2. Second version hand-rolled JPEG/PNG-only decoding via `jpeg-js` +
 *     `pngjs` (pure JS, no native step -- safe, but only two formats).
 *     That silently mis-handled anything else (WebP, and critically
 *     HEIC -- the iPhone camera's default format): decode would throw,
 *     and the generic fail-safe below turned that into MANUAL_REVIEW,
 *     which still creates the photo and still shows it in the uploader's
 *     OWN profile (only hidden from other users) -- so an unsupported
 *     format looked identical to an approved photo to whoever was
 *     testing. That's what actually happened testing a car photo.
 *
 *  This version uses `sharp` for decoding -- the same library Next.js's
 *  own built-in image optimization uses in production on Vercel, so its
 *  prebuilt native binary (resolved automatically per-platform via npm
 *  optional dependencies) is proven safe there, unlike canvas's from-
 *  source build. Sharp handles JPEG/PNG/WebP/GIF/AVIF/TIFF -- everything
 *  an Android camera or a browser "Save image" produces -- directly.
 *  HEIC/HEIF (the iPhone default) is the one format sharp's stock binary
 *  can't decode (licensing, not a technical gap), so that one case is
 *  special-cased through `heic-convert`, which decodes via a WASM build
 *  of libheif (`libheif-js`) -- a static .wasm asset, no native
 *  compilation, same safety profile as sharp's prebuilt binary.
 *
 * Setup: the npm packages are already in package.json (always
 * installed), and scripts/download-face-api-models.mjs fetches
 * ssd_mobilenetv1's model weight files (face counting only -- no
 * landmark/recognition model needed) into FACE_API_MODEL_PATH
 * automatically before every build and `next dev` run (see package.json's
 * "prebuild"/"predev"). The only manual step left is setting
 * IMAGE_MODERATION_PROVIDER=self-hosted -- including on Vercel
 * (Production + Preview), then redeploying, since an env var change alone
 * doesn't touch an existing deployment.
 *
 * Until that's set, this provider never runs at all -- "mock" mode
 * (the default) never looks at the image, by design, so it approves
 * anything (a car photo included) purely to exercise the upload ->
 * moderate -> Photo pipeline in dev/tests without any ML dependencies.
 * That's expected mock behavior, not a bug in the policy engine below.
 */
export const selfHostedImageModerationProvider: ImageModerationProvider = {
  name: 'self-hosted-nsfwjs+faceapi',
  modelVersion: 'nsfwjs-mobilenet-v2+faceapi-ssd-mobilenetv1-4',
  async analyze(imageBuffer) {
    // Typed as `any`, not `typeof import(...)`: these are real
    // dependencies (see package.json) so they resolve fine once
    // installed, but `@ts-ignore` (not `@ts-expect-error` -- that fails
    // the build the moment the import DOES type-check cleanly, which is
    // exactly what broke an earlier version of this file) suppresses
    // either way, whether or not there's an error to suppress. Dynamic
    // import, not a static one, purely so this whole function -- and
    // needing any of these packages at all -- stays opt-in behind
    // IMAGE_MODERATION_PROVIDER=self-hosted; same pattern as lib/native.ts
    // uses for @capacitor/*.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let nsfwjs: any;
    let faceapi: any;
    let tf: any;
    let sharp: any;
    let heicConvert: any;
    try {
      // @ts-ignore
      nsfwjs = await import('nsfwjs');
      // @ts-ignore
      faceapi = await import('@vladmandic/face-api');
      // @ts-ignore
      tf = await import('@tensorflow/tfjs');
      // @ts-ignore
      sharp = (await import('sharp')).default;
      // @ts-ignore
      heicConvert = (await import('heic-convert')).default;
    } catch (err) {
      throw new Error(
        `[imageModeration] self-hosted provider selected but its dependencies ` +
          `aren't installed (npm install nsfwjs @vladmandic/face-api @tensorflow/tfjs sharp heic-convert) ` +
          `or face-api's model files are missing. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }

    const { data: rgb, width, height } = await decodeToRgb(imageBuffer, sharp, heicConvert);

    const modelPath = process.env.FACE_API_MODEL_PATH || './public/models/face-api';
    // Guarded, not reloaded every call: loadFromDisk re-reads the ~6MB
    // model weight files from disk every time it's called, and a
    // serverless function reuses its module scope (and this loaded state)
    // across warm invocations, so this both saves real I/O per request and
    // reduces exposure to the exact failure mode this try/catch exists
    // for. Wrapped separately from the dynamic-import try/catch above
    // because this failure means something different: the packages ARE
    // installed, but the model weight files aren't reachable at this path
    // in THIS deployment -- see next.config.mjs's outputFileTracingIncludes
    // comment for the specific Vercel gotcha that causes exactly this.
    if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
      } catch (err) {
        throw new Error(
          `[imageModeration] face-api model files not found at "${modelPath}" -- either ` +
            `scripts/download-face-api-models.mjs didn't run before this deploy, or (on Vercel) ` +
            `they were traced out of this function's bundle (see next.config.mjs's ` +
            `outputFileTracingIncludes). Original error: ${err instanceof Error ? err.message : err}`,
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
  },
};

/**
 * ISOBMFF ("ftyp" box) sniff for HEIC/HEIF -- the same check the `file-type`
 * npm package and most format sniffers use. HEIC containers share MP4's
 * container format, so this can't be a simple magic-byte prefix check the
 * way PNG/JPEG are; it has to look at the brand tag inside the ftyp box.
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
 *
 * Throws UndecodableImageError (not a plain Error) for a genuinely
 * corrupt or unrecognized file, so moderateAndUpload.ts can tell "this
 * isn't a photo we can analyze" apart from "our analysis pipeline broke"
 * and reject the former outright instead of routing it to manual review
 * -- see that file's catch block, and the DECODE HISTORY note above this
 * provider for why that distinction exists at all.
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

export function getImageModerationProvider(): ImageModerationProvider {
  const provider = process.env.IMAGE_MODERATION_PROVIDER ?? 'mock';
  if (provider === 'self-hosted') return selfHostedImageModerationProvider;
  return mockImageModerationProvider;
}

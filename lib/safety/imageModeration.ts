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
 * CORRECTION (2026-09-26): the first version of this file used the
 * `canvas` package (node-canvas) purely to decode images. That broke a
 * real Vercel deploy outright -- `npm install` failed building canvas's
 * native addon (`Package pixman-1 was not found`, and no prebuilt binary
 * exists for Vercel's Node ABI). That wasn't a "might exceed a size
 * limit" risk, it was a hard failure, so it's removed entirely rather
 * than patched around. This version decodes JPEG/PNG buffers with pure-JS
 * libraries (`jpeg-js`, `pngjs` -- neither has a native build step, so
 * `npm install` can never fail this way again) into a raw pixel array,
 * builds a `tf.Tensor3D` from it directly, and hands that tensor straight
 * to both nsfwjs and face-api -- both accept a `tf.Tensor3D` as input
 * without needing a Canvas/Image/DOM shim at all. This is the standard,
 * documented way to run either library in Node without tfjs-node or
 * node-canvas.
 *
 * Setup: the npm packages are already in package.json (always
 * installed), and scripts/download-face-api-models.mjs fetches
 * ssd_mobilenetv1's model weight files (face counting only -- no
 * landmark/recognition model needed) into FACE_API_MODEL_PATH
 * automatically before every build and `next dev` run (see package.json's
 * "prebuild"/"predev", which download from jsdelivr's npm CDN, failing
 * soft with a warning rather than blocking the build if that fetch
 * fails). The only manual step left is setting
 * IMAGE_MODERATION_PROVIDER=self-hosted -- including on Vercel
 * (Production + Preview), then redeploying, since an env var change alone
 * doesn't touch an existing deployment.
 *
 * Until that's set, this provider never runs at all -- "mock" mode
 * (the default) never looks at the image, by design, so it approves
 * anything (a car photo included) purely to exercise the upload ->
 * moderate -> Photo pipeline in dev/tests without any ML dependencies.
 * That's expected mock behavior, not a bug in the policy engine below.
 *
 * If the model files still couldn't be fetched by the time a request
 * comes in (fetch failed at build time, or FACE_API_MODEL_PATH points
 * somewhere else), this throws rather than silently falling back
 * to "approve everything" -- moderateAndUpload.ts catches that error and
 * routes the photo to MANUAL_REVIEW instead, so a misconfigured deployment
 * fails safe (more admin review work) rather than fails open (unmoderated
 * photos going live). The error is logged loudly specifically so that
 * silent-degradation-to-mock never happens unnoticed in production.
 */
export const selfHostedImageModerationProvider: ImageModerationProvider = {
  name: 'self-hosted-nsfwjs+faceapi',
  modelVersion: 'nsfwjs-mobilenet-v2+faceapi-ssd-mobilenetv1-3',
  async analyze(imageBuffer) {
    // Typed as `any`, not `typeof import(...)`: these are real
    // dependencies (see package.json) so they resolve fine once installed,
    // but two of them (jpeg-js, pngjs) ship no TypeScript declarations, so
    // a plain `import` can still fail `tsc` depending on whether
    // @types/* happens to be present. `@ts-ignore` (not `@ts-expect-error`
    // -- that fails the build with "unused directive" the moment the
    // import *does* type-check cleanly, which is exactly what broke this
    // build once npm install actually succeeded) suppresses either way,
    // whether or not there's an error to suppress. Dynamic import, not a
    // static one, purely so this whole function -- and needing any of
    // these five packages at all -- stays opt-in behind
    // IMAGE_MODERATION_PROVIDER=self-hosted; same pattern as lib/native.ts
    // uses for @capacitor/*.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let nsfwjs: any;
    let faceapi: any;
    let tf: any;
    let jpeg: any;
    let PNG: any;
    try {
      // @ts-ignore
      nsfwjs = await import('nsfwjs');
      // @ts-ignore
      faceapi = await import('@vladmandic/face-api');
      // @ts-ignore
      tf = await import('@tensorflow/tfjs');
      // @ts-ignore
      jpeg = await import('jpeg-js');
      // @ts-ignore
      ({ PNG } = await import('pngjs'));
    } catch (err) {
      throw new Error(
        `[imageModeration] self-hosted provider selected but its dependencies ` +
          `aren't installed (npm install nsfwjs @vladmandic/face-api @tensorflow/tfjs jpeg-js pngjs) ` +
          `or face-api's model files are missing. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }

    const { data: rgba, width, height } = decodeToRgba(imageBuffer, jpeg, PNG);

    // Drop the alpha channel -- both models expect 3-channel RGB.
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i] ?? 0;
      rgb[j + 1] = rgba[i + 1] ?? 0;
      rgb[j + 2] = rgba[i + 2] ?? 0;
    }

    const modelPath = process.env.FACE_API_MODEL_PATH || './public/models/face-api';
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);

    const imageTensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
    try {
      const [nsfwModel, faceDetections] = await Promise.all([
        nsfwjs.load(),
        faceapi.detectAllFaces(imageTensor),
      ]);
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
 * Sniffs the format from magic bytes and decodes to a flat RGBA pixel
 * buffer, entirely in pure JS. Only JPEG and PNG are supported -- those
 * are the only two formats lib/upload.ts's assertValidImage() accepts,
 * specifically BECAUSE this function can only decode those two.
 *
 * IMPORTANT: this throws a clearly-labeled error for anything else
 * (WebP, HEIC, GIF, ...) rather than guessing "must be JPEG" the way an
 * earlier version of this file did. That earlier version's silent
 * fallback was a real bypass: an unrecognized format would fail
 * jpeg.decode() with an opaque error, which moderateAndUpload.ts's
 * fail-safe turns into MANUAL_REVIEW -- and a MANUAL_REVIEW photo still
 * gets created and still shows up in the uploader's own profile (it's
 * only hidden from *other* users), so from the person testing it, an
 * unsupported-format photo looked identical to an approved one. A car
 * photo saved as WebP (common from a quick reverse-image-search save) or
 * HEIC (default on iPhone) would have silently passed straight through
 * exactly like that -- see decode() below and assertValidImage() for the
 * two-sided fix: the client is told plainly to use JPG/PNG instead of
 * being waved through to a review queue nobody is watching yet.
 */
function decodeToRgba(
  buffer: Buffer,
  jpeg: { decode: (b: Buffer, opts?: { useTArray?: boolean }) => { width: number; height: number; data: Uint8Array } },
  PNG: new () => { parse: (b: Buffer, cb: (err: Error | null, data: { width: number; height: number; data: Uint8Array }) => void) => void },
): { data: Uint8Array; width: number; height: number } {
  const isPng =
    buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  if (isPng) {
    // pngjs's callback-style parse is synchronous under the hood for an
    // in-memory buffer; wrap it so this function stays a plain sync call.
    let result: { width: number; height: number; data: Uint8Array } | null = null;
    let parseError: Error | null = null;
    new PNG().parse(buffer, (err, data) => {
      parseError = err;
      result = data;
    });
    if (parseError) throw parseError;
    if (!result) throw new Error('[imageModeration] PNG decode produced no data');
    return result;
  }
  if (isJpeg) {
    return jpeg.decode(buffer, { useTArray: true });
  }
  throw new Error(
    '[imageModeration] unsupported image format for decoding (only JPEG/PNG magic bytes recognized) -- ' +
      'this should have been caught by assertValidImage() before reaching here',
  );
}

export function getImageModerationProvider(): ImageModerationProvider {
  const provider = process.env.IMAGE_MODERATION_PROVIDER ?? 'mock';
  if (provider === 'self-hosted') return selfHostedImageModerationProvider;
  return mockImageModerationProvider;
}

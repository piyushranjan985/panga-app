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
 * licensed.
 *
 * Deliberately does NOT use @tensorflow/tfjs-node. tfjs-node ships a large
 * prebuilt native binary (100MB+) that risks blowing past a Vercel
 * serverless function's size/memory limits -- on the Hobby (free) plan
 * that can mean a failed deploy or a forced upgrade to a paid plan, which
 * is exactly the kind of cost this was built to avoid. Instead this uses
 * plain @tensorflow/tfjs (pure JavaScript, no native bindings -- slower
 * per photo, but $0 and safe to deploy on any plan) plus the `canvas`
 * package purely for decoding the image buffer into pixels (the standard,
 * documented way to run face-api in Node without a GPU backend -- see
 * https://github.com/vladmandic/face-api's Node.js usage notes). `canvas`
 * does have its own small native build step (Cairo), but it's a fraction
 * of tfjs-node's size and is commonly deployed on Vercel already (it's
 * the standard library behind most "generate an OG image" routes). If
 * `canvas`'s native build ever turns out to be a problem on your plan
 * too, the fallback is to run this specific analyze() step outside Vercel
 * serverless (e.g. a small always-on Node process) rather than paying for
 * a bigger plan -- flag that to the user before doing it, per the
 * cost-disclosure rule this whole provider exists to satisfy.
 *
 * Setup steps, none of which this sandbox can do (they all need network):
 *
 *   1. npm install nsfwjs @vladmandic/face-api @tensorflow/tfjs canvas
 *   2. Download face-api's model weight files (ssd_mobilenetv1,
 *      face_landmark_68 -- no face_recognition model needed, since there's
 *      no embedding to compare against) into public/models/face-api/ (or
 *      another path FACE_API_MODEL_PATH points at) -- see
 *      https://github.com/vladmandic/face-api/tree/master/model for the
 *      exact files.
 *   3. Set IMAGE_MODERATION_PROVIDER=self-hosted in .env.
 *
 * Until all three are done, this throws rather than silently falling back
 * to "approve everything" -- moderateAndUpload.ts catches that error and
 * routes the photo to MANUAL_REVIEW instead, so a misconfigured deployment
 * fails safe (more admin review work) rather than fails open (unmoderated
 * photos going live). The error is logged loudly specifically so that
 * silent-degradation-to-mock never happens unnoticed in production.
 */
export const selfHostedImageModerationProvider: ImageModerationProvider = {
  name: 'self-hosted-nsfwjs+faceapi',
  modelVersion: 'nsfwjs-mobilenet-v2+faceapi-ssd-mobilenetv1-2',
  async analyze(imageBuffer) {
    // Typed as `any`, not `typeof import(...)`: these packages have no
    // type declarations resolvable until they're actually installed (see
    // the setup steps in this file's doc comment), and this whole
    // function doesn't run -- so isn't worth blocking `tsc --noEmit` on --
    // until IMAGE_MODERATION_PROVIDER=self-hosted is actually selected.
    // Same "optional peer-ish dependency" pattern as lib/native.ts uses
    // for @capacitor/* (dynamic import, never a static one).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let nsfwjs: any;
    let faceapi: any;
    let canvasPkg: any;
    try {
      // @ts-expect-error -- optional dependency, not installed yet
      nsfwjs = await import('nsfwjs');
      // @ts-expect-error -- optional dependency, not installed yet
      faceapi = await import('@vladmandic/face-api');
      // @ts-expect-error -- optional dependency, not installed yet
      canvasPkg = await import('canvas');
    } catch (err) {
      throw new Error(
        `[imageModeration] self-hosted provider selected but its dependencies ` +
          `aren't installed (npm install nsfwjs @vladmandic/face-api @tensorflow/tfjs canvas) ` +
          `or face-api's model files are missing. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }

    // face-api's documented Node.js setup: patch its DOM-ish env with
    // node-canvas's implementations so it can decode/draw images outside
    // a browser, without pulling in tfjs-node.
    faceapi.env.monkeyPatch({
      Canvas: canvasPkg.Canvas,
      Image: canvasPkg.Image,
      ImageData: canvasPkg.ImageData,
    });

    const modelPath = process.env.FACE_API_MODEL_PATH || './public/models/face-api';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
    ]);

    const image = await canvasPkg.loadImage(imageBuffer);
    const canvas = canvasPkg.createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, image.width, image.height);

    const [nsfwModel, faceDetections] = await Promise.all([
      nsfwjs.load(), // defaults to the pure-JS tfjs backend when @tensorflow/tfjs-node isn't present
      faceapi.detectAllFaces(canvas).withFaceLandmarks(),
    ]);
    const nsfwPredictions = await nsfwModel.classify(canvas);
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
  },
};

export function getImageModerationProvider(): ImageModerationProvider {
  const provider = process.env.IMAGE_MODERATION_PROVIDER ?? 'mock';
  if (provider === 'self-hosted') return selfHostedImageModerationProvider;
  return mockImageModerationProvider;
}

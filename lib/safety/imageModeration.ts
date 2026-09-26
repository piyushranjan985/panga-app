import type { ModerationSignals } from './policyEngine';

/**
 * Provider-agnostic image analysis. Swapping providers (self-hosted ->
 * a paid vendor later, if ever) means writing one new class here and
 * flipping IMAGE_MODERATION_PROVIDER -- nothing else in the app changes.
 * See docs/IDENTITY_VERIFICATION_AND_SAFETY.md sections 1, 3.
 */
export interface ImageModerationProvider {
  readonly name: string;
  readonly modelVersion: string;
  analyze(imageBuffer: Buffer, opts?: { verifiedFaceEmbedding?: number[] | null }): Promise<ModerationSignals>;
}

/**
 * Deterministic, dependency-free provider for local dev and automated
 * tests. Assumes a clean single-face photo by default so the upload -> 
 * moderation -> Photo pipeline is exercisable end-to-end without any ML
 * dependencies installed. Mirrors the existing VERIFICATION_PROVIDER=mock
 * convention in app/api/verification/route.ts.
 *
 * `matchedVerifiedFace` is deliberately null when no reference embedding is
 * passed in (rather than true), so the policy engine correctly routes to
 * MANUAL_REVIEW until real identity verification (which produces the
 * reference embedding) is wired up -- see lib/safety/identityVerification.ts
 * (not yet built; Phase 2B).
 */
export const mockImageModerationProvider: ImageModerationProvider = {
  name: 'mock',
  modelVersion: 'mock-1',
  async analyze(_imageBuffer, opts) {
    return {
      faceCount: 1,
      matchedVerifiedFace: opts?.verifiedFaceEmbedding ? true : null,
      nudityScores: { porn: 0, hentai: 0, sexy: 0 },
    };
  },
};

/**
 * Real, $0 provider: nsfwjs (nudity/explicit classification) + face-api.js
 * (face detection + recognition embeddings), both self-hosted, both MIT
 * licensed. NOT wired up to run yet -- see the setup steps below, none of
 * which this sandbox can do (they all need network):
 *
 *   1. npm install nsfwjs face-api.js @tensorflow/tfjs-node
 *   2. Download face-api.js's model weight files (ssd_mobilenetv1,
 *      face_landmark_68, face_recognition -- see
 *      https://github.com/vladmandic/face-api's model repo) into
 *      public/models/face-api/ (or another path FACE_API_MODEL_PATH points
 *      at) -- these are binary weight files, not npm-installable, must be
 *      downloaded directly.
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
  modelVersion: 'nsfwjs-mobilenet-v2+faceapi-ssd-mobilenetv1-1',
  async analyze(imageBuffer, opts) {
    // Typed as `any`, not `typeof import(...)`: these three packages have
    // no type declarations resolvable until they're actually installed
    // (see the setup steps in this file's doc comment), and this whole
    // function doesn't run -- so isn't worth blocking `tsc --noEmit` on --
    // until IMAGE_MODERATION_PROVIDER=self-hosted is actually selected.
    // Same "optional peer-ish dependency" pattern as lib/native.ts uses
    // for @capacitor/* (dynamic import, never a static one).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let nsfwjs: any;
    let faceapi: any;
    let tf: any;
    try {
      // @ts-expect-error -- optional dependency, not installed yet
      nsfwjs = await import('nsfwjs');
      // @ts-expect-error -- optional dependency, not installed yet
      faceapi = await import('@vladmandic/face-api');
      // @ts-expect-error -- optional dependency, not installed yet
      tf = await import('@tensorflow/tfjs-node');
    } catch (err) {
      throw new Error(
        `[imageModeration] self-hosted provider selected but its dependencies ` +
          `aren't installed (npm install nsfwjs @vladmandic/face-api @tensorflow/tfjs-node) ` +
          `or face-api's model files are missing. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }

    const modelPath = process.env.FACE_API_MODEL_PATH || './public/models/face-api';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
    ]);

    const decodedImage = tf.node.decodeImage(imageBuffer, 3);
    try {
      const [nsfwModel, faceDetections] = await Promise.all([
        nsfwjs.load(),
        faceapi.detectAllFaces(decodedImage).withFaceLandmarks().withFaceDescriptors(),
      ]);
      const nsfwPredictions = await nsfwModel.classify(decodedImage);
      const scoreFor = (className: string) =>
        nsfwPredictions.find((p: { className: string; probability: number }) => p.className === className)
          ?.probability ?? 0;

      let matchedVerifiedFace: boolean | null = null;
      if (opts?.verifiedFaceEmbedding && faceDetections.length > 0) {
        const threshold = 0.6; // face-api.js's documented "same person" cutoff
        matchedVerifiedFace = faceDetections.some(
          (d: { descriptor: Float32Array }) =>
            faceapi.euclideanDistance(Array.from(d.descriptor), opts.verifiedFaceEmbedding!) < threshold,
        );
      }

      return {
        faceCount: faceDetections.length,
        matchedVerifiedFace,
        nudityScores: {
          porn: scoreFor('Porn'),
          hentai: scoreFor('Hentai'),
          sexy: scoreFor('Sexy'),
        },
      };
    } finally {
      decodedImage.dispose();
    }
  },
};

export function getImageModerationProvider(): ImageModerationProvider {
  const provider = process.env.IMAGE_MODERATION_PROVIDER ?? 'mock';
  if (provider === 'self-hosted') return selfHostedImageModerationProvider;
  return mockImageModerationProvider;
}

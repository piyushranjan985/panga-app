#!/usr/bin/env node
// Downloads face-api's ssd_mobilenetv1 model weights (the only model
// lib/safety/imageModeration.ts's self-hosted provider needs -- face
// counting only, no landmarks/recognition, see that file) into
// public/models/face-api/, if they aren't already there.
//
// Runs as part of `npm run build` (and `predev`, for local testing --
// see package.json) rather than being checked into git as ~10MB of
// binary weights. Served from jsdelivr's npm CDN (mirrors the published
// @vladmandic/face-api package contents) rather than a GitHub branch
// path, so it doesn't break if that repo's default branch is ever
// renamed.
//
// Fails SOFT, not hard: a network hiccup here logs a clear warning and
// lets the build continue -- these files only matter when
// IMAGE_MODERATION_PROVIDER=self-hosted is actually selected, and an
// optional feature's setup step should never block deploying the rest
// of the app (see this session's `canvas` incident, which did exactly
// that for a different reason).

import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const MODEL_DIR = path.join(process.cwd(), 'public', 'models', 'face-api');
const BASE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
];

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  await pipeline(res.body, createWriteStream(destPath));
}

async function main() {
  mkdirSync(MODEL_DIR, { recursive: true });
  const missing = FILES.filter((name) => !existsSync(path.join(MODEL_DIR, name)));
  if (missing.length === 0) {
    console.log('[download-face-api-models] all model files already present, skipping');
    return;
  }
  for (const name of missing) {
    try {
      console.log(`[download-face-api-models] fetching ${name}...`);
      await downloadFile(`${BASE_URL}/${name}`, path.join(MODEL_DIR, name));
    } catch (err) {
      console.warn(
        `[download-face-api-models] WARNING: could not fetch ${name} (${err instanceof Error ? err.message : err}). ` +
          `IMAGE_MODERATION_PROVIDER=self-hosted will fail (routing every photo to MANUAL_REVIEW, ` +
          `see lib/safety/imageModeration.ts's fail-safe) until this succeeds -- the rest of the app is ` +
          `unaffected. Not blocking the build.`,
      );
    }
  }
}

main().catch((err) => {
  console.warn('[download-face-api-models] WARNING: unexpected failure, continuing build anyway:', err);
});

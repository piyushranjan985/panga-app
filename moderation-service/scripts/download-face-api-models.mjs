#!/usr/bin/env node
// Copies face-api's ssd_mobilenetv1 model weights (the only model
// lib/imageAnalysis.ts needs -- face counting only, no landmarks/
// recognition) into public/models/face-api/, if they aren't already
// there.
//
// This is a straight port of the main findmyvybe-app repo's
// scripts/download-face-api-models.mjs (same reasoning, same source,
// same fail-soft behavior) -- see that file's own comment for the full
// history of why it copies from node_modules rather than a CDN. Kept
// as two copies rather than one shared script because this service and
// the main app are two separate Vercel projects/npm installs with no
// shared node_modules to point a single script at.
//
// Runs as part of `npm run build` (and `predev`, for local testing --
// see package.json) rather than being checked into git as ~5.5MB of
// binary weights.

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MODEL_DIR = path.join(process.cwd(), 'public', 'models', 'face-api');
const SOURCE_DIR = path.join(process.cwd(), 'node_modules', '@vladmandic', 'face-api', 'model');
const MODEL_NAME = 'ssd_mobilenetv1_model';

function main() {
  mkdirSync(MODEL_DIR, { recursive: true });

  if (!existsSync(SOURCE_DIR)) {
    console.warn(
      `[download-face-api-models] WARNING: ${SOURCE_DIR} not found (is @vladmandic/face-api installed?). ` +
        `This service will fail to analyze images until this is resolved.`,
    );
    return;
  }

  // Copy every file in the package's model/ dir whose name starts with
  // the model name -- this covers both the manifest and whatever
  // weight-file layout that package version actually uses (currently a
  // single `${MODEL_NAME}.bin`, previously sharded files in older
  // releases), so this script doesn't have to hardcode a file list that
  // can drift out of sync with the installed version.
  const filesToCopy = readdirSync(SOURCE_DIR).filter((name) => name.startsWith(MODEL_NAME));

  if (filesToCopy.length === 0) {
    console.warn(
      `[download-face-api-models] WARNING: no files matching "${MODEL_NAME}*" found in ${SOURCE_DIR}. ` +
        `This service will fail to analyze images until this is resolved.`,
    );
    return;
  }

  let copied = 0;
  for (const name of filesToCopy) {
    const dest = path.join(MODEL_DIR, name);
    const src = path.join(SOURCE_DIR, name);
    if (existsSync(dest)) continue;
    try {
      copyFileSync(src, dest);
      copied += 1;
    } catch (err) {
      console.warn(
        `[download-face-api-models] WARNING: could not copy ${name} (${err instanceof Error ? err.message : err}). ` +
          `This service will fail to analyze images until this succeeds.`,
      );
    }
  }

  if (copied === 0) {
    console.log('[download-face-api-models] all model files already present, skipping');
  } else {
    console.log(`[download-face-api-models] copied ${copied} file(s) from installed @vladmandic/face-api package`);
  }
}

main();

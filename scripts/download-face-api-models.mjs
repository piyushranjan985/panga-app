#!/usr/bin/env node
// Copies face-api's ssd_mobilenetv1 model weights (the only model
// lib/safety/imageModeration.ts's self-hosted provider needs -- face
// counting only, no landmarks/recognition, see that file) into
// public/models/face-api/, if they aren't already there.
//
// Runs as part of `npm run build` (and `predev`, for local testing --
// see package.json) rather than being checked into git as ~5.5MB of
// binary weights.
//
// SOURCE: copied straight from this package's own installed copy
// (node_modules/@vladmandic/face-api/model/), NOT fetched from a CDN.
// This used to fetch from jsdelivr's unversioned "latest" npm alias
// (cdn.jsdelivr.net/npm/@vladmandic/face-api/model), which silently
// drifts out of sync with whatever version package.json actually pins
// -- that mismatch is exactly what broke self-hosted moderation: the
// installed package (1.7.15) ships the model as ONE file,
// ssd_mobilenetv1_model.bin (per its own weights-manifest.json
// "paths"), but the CDN's "latest" tag served leftover
// ssd_mobilenetv1_model-shard1/-shard2 files from a different,
// sharded-format release -- so face-api's loader (which trusts the
// manifest that ships with the version actually loaded at runtime)
// went looking for a .bin file that was never downloaded. Copying
// from node_modules instead guarantees the files always match the
// exact version require()'d at runtime, and removes the network
// dependency (and its flakiness) entirely -- npm install already put
// these bytes on disk before this script ever runs.
//
// Fails SOFT, not hard: if the installed package is ever missing
// these files (e.g. a future face-api version reorganizes its model
// folder), this logs a clear warning and lets the build continue --
// these files only matter when IMAGE_MODERATION_PROVIDER=self-hosted
// is actually selected, and an optional feature's setup step should
// never block deploying the rest of the app (see this session's
// `canvas` incident, which did exactly that for a different reason).

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
        `IMAGE_MODERATION_PROVIDER=self-hosted will fail until this is resolved -- the rest of the app is unaffected.`,
    );
    return;
  }

  // Copy every file in the package's model/ dir whose name starts with
  // the model name -- this covers both the manifest and whatever
  // weight-file layout that package version actually uses (currently
  // a single `${MODEL_NAME}.bin`, previously sharded files in older
  // releases), so this script doesn't have to hardcode a file list
  // that can drift out of sync with the installed version again.
  const filesToCopy = readdirSync(SOURCE_DIR).filter((name) => name.startsWith(MODEL_NAME));

  if (filesToCopy.length === 0) {
    console.warn(
      `[download-face-api-models] WARNING: no files matching "${MODEL_NAME}*" found in ${SOURCE_DIR}. ` +
        `IMAGE_MODERATION_PROVIDER=self-hosted will fail until this is resolved -- the rest of the app is unaffected.`,
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
          `IMAGE_MODERATION_PROVIDER=self-hosted will fail until this succeeds -- the rest of the app is unaffected.`,
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

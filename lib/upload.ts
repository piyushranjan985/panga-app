import { put, del } from '@vercel/blob';

/**
 * Photo storage: Vercel Blob, since that's zero-extra-infra on Vercel
 * hosting (versus standing up S3/Cloudinary) and needs no code beyond an
 * API token. Requires connecting a Blob store to the Vercel project (which
 * auto-injects BLOB_READ_WRITE_TOKEN) and running `npm install @vercel/blob`
 * — see the photo feature's setup notes.
 *
 * Files go straight through this Next.js route handler rather than using
 * Vercel Blob's client-upload/token flow, so MAX_UPLOAD_BYTES is kept
 * comfortably under typical serverless request-body limits. If photos ever
 * need to be larger than that, switch to @vercel/blob/client's upload()
 * (browser uploads directly to Blob storage, bypassing this limit) — same
 * "simple now, documented upgrade path" trade-off as db.ts and
 * app/api/discover/route.ts make elsewhere in this codebase.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB

// Restricted to what lib/safety/imageModeration.ts's self-hosted provider
// can actually decode (jpeg-js + pngjs, both pure JS, no native deps --
// see that file). This used to accept any `image/*` MIME type, which was
// a real moderation bypass: a WebP or HEIC photo (HEIC being the iPhone
// camera default) would fail to decode, and moderateAndUpload.ts's
// fail-safe turns a decode error into MANUAL_REVIEW rather than a hard
// block -- and a MANUAL_REVIEW photo still gets created and still shows
// up in the uploader's own profile, so it looked identical to an
// approved photo. Rejecting the format up front, with a clear message,
// closes that instead of relying on the review queue to catch it.
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

export function assertValidImage(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Please upload a JPG or PNG photo (other formats like HEIC/WebP/GIF aren\'t supported yet).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be under 4MB');
  }
}

export async function uploadImage(file: File, pathPrefix: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const key = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
  const blob = await put(key, file, {
    access: 'public',
    contentType: file.type || undefined,
  });
  return blob.url;
}

export async function deleteImage(url: string) {
  try {
    await del(url);
  } catch {
    // Best-effort: an already-missing blob (or a seeded external URL that
    // was never actually stored in Blob) shouldn't block deleting the
    // Photo row itself.
  }
}

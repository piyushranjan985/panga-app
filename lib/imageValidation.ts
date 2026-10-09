/**
 * Pure, dependency-free image-upload validation -- deliberately split out
 * of lib/upload.ts so it can be imported from CLIENT components
 * (app/onboarding/page.tsx, app/profile/page.tsx) without pulling
 * @vercel/blob (lib/upload.ts's other import) into the browser bundle.
 * lib/upload.ts re-exports these for the server route handlers that
 * already imported them from there.
 *
 * Running this in the browser before the upload fetch, not just inside
 * the route handler afterward, is the actual point: Vercel's platform
 * itself hard-rejects an oversized request body before our route handler
 * code ever runs, with a plain-text error ("Request Entity Too Large"),
 * not JSON -- so a file that's too big used to reach the network, get
 * rejected by the platform, and then crash the client's `res.json()`
 * call with a confusing "Unexpected token 'R' ... is not valid JSON"
 * instead of the friendly "Image must be under 4MB" message this
 * function already throws. Checking here, client-side, before ever
 * calling fetch, stops an oversized file from being sent at all.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB

// The real content gate is decode-time, inside
// lib/safety/imageModeration.ts (sharp + heic-convert, which between them
// handle every common phone/browser photo format) -- an undecodable file
// gets REJECTED there with a clear reason, not silently waved through.
// This upfront check is just a fast, friendly first filter, not the sole
// boundary, which is why it's permissive rather than a strict allowlist:
// it also accepts an empty/generic MIME type paired with a recognized
// extension, since some mobile browsers report HEIC photos that way.
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/avif',
]);
const ACCEPTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'avif']);

export function assertValidImage(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const genericOrEmptyType = file.type === '' || file.type === 'application/octet-stream';
  const acceptable = ACCEPTED_IMAGE_TYPES.has(file.type) || (genericOrEmptyType && ACCEPTED_IMAGE_EXTENSIONS.has(ext));
  if (!acceptable) {
    throw new Error('Please upload a photo (JPG, PNG, HEIC, or WebP).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be under 4MB');
  }
}

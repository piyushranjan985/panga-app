import { put, del } from '@vercel/blob';
import { isHeic } from '@/lib/safety/imageModeration';

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

export interface NormalizedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/**
 * HEIC (the iPhone camera's default format) decodes fine for moderation
 * (see imageModeration.ts, which converts it internally for analysis),
 * but almost no browser besides Safari can render raw HEIC bytes in an
 * <img> tag -- so a HEIC photo that passed moderation would still show
 * up as a broken image to anyone not on Safari/iOS. This re-encodes HEIC
 * to JPEG specifically for STORAGE, independent of whether
 * IMAGE_MODERATION_PROVIDER is even "self-hosted" (display compatibility
 * isn't a moderation concern) -- everything else (JPEG/PNG/WebP/GIF/AVIF)
 * already renders natively in every current browser, so it's stored as
 * uploaded.
 */
export async function normalizeImageForStorage(buffer: Buffer, originalType: string): Promise<NormalizedImage> {
  if (isHeic(buffer)) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    let heicConvert: any;
    try {
      // @ts-ignore -- real dependency (package.json), same
      // "not resolvable until installed" situation as
      // lib/safety/imageModeration.ts's dynamic imports
      heicConvert = (await import('heic-convert')).default;
    } catch (err) {
      throw new Error(
        `heic-convert isn't installed (npm install heic-convert) -- can't store a HEIC photo as a browser-displayable JPEG. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }
    const jpegBuffer = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 0.92 }));
    return { buffer: jpegBuffer, contentType: 'image/jpeg', ext: 'jpg' };
  }
  const ext = originalType.split('/')[1] || 'jpg';
  return { buffer, contentType: originalType || 'image/jpeg', ext };
}

export async function uploadImageBuffer(image: NormalizedImage, pathPrefix: string): Promise<string> {
  const key = `${pathPrefix}/${crypto.randomUUID()}.${image.ext}`;
  const blob = await put(key, image.buffer, {
    access: 'public',
    contentType: image.contentType,
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

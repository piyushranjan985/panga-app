import { put, del } from '@vercel/blob';
import { isHeic } from '@/lib/safety/imageModeration';
import { MAX_UPLOAD_BYTES, assertValidImage } from '@/lib/imageValidation';

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
 *
 * MAX_UPLOAD_BYTES and assertValidImage now live in lib/imageValidation.ts
 * (pure, no @vercel/blob import) so the client-side upload forms can run
 * the same check before ever calling fetch, instead of only finding out
 * a file's too big after the platform itself has already rejected the
 * oversized request body with a non-JSON error. Re-exported here so the
 * existing route-handler imports (`@/lib/upload`) don't need to change.
 */
export { MAX_UPLOAD_BYTES, assertValidImage };

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

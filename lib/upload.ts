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

export function assertValidImage(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed');
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

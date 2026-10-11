import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { isHeic } from '@/lib/safety/imageModeration';
import { MAX_UPLOAD_BYTES, assertValidImage } from '@/lib/imageValidation';

/**
 * Photo storage: Cloudflare R2, via its S3-compatible API
 * (@aws-sdk/client-s3 pointed at R2's endpoint, region "auto").
 *
 * Previously Vercel Blob -- migrated off it specifically for R2's zero
 * egress fee: this app's access pattern is read-heavy (every swipe-feed
 * card fetches a photo, so views vastly outnumber uploads), and Blob
 * charges per GB served while R2 charges nothing to serve. See
 * docs/BLOB_STORAGE_COST_COMPARISON.md for the full cost comparison and
 * migration rationale. Photos are served publicly from R2's custom
 * domain (media.findmyvybe.com, configured in the Cloudflare dashboard
 * against the `findmyvybe-profile-pics` bucket) -- not R2's own
 * pub-*.r2.dev development URL, which Cloudflare doesn't recommend for
 * production traffic.
 *
 * Requires R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (an
 * R2 API token scoped to just this bucket -- Object Read & Write,
 * "Apply to specific buckets only") / R2_BUCKET_NAME / R2_PUBLIC_URL in
 * the environment -- see .env.example. Unlike BLOB_READ_WRITE_TOKEN
 * (which Vercel auto-injected once a Blob store was connected), these
 * have to be set manually in each environment (local .env, and Vercel's
 * Production/Preview project env vars) since R2 isn't a Vercel-native
 * integration.
 *
 * Files go straight through this Next.js route handler rather than a
 * client-direct-upload flow, so MAX_UPLOAD_BYTES is kept comfortably
 * under typical serverless request-body limits -- same reasoning as
 * before the migration; nothing about this trade-off changed.
 *
 * MAX_UPLOAD_BYTES and assertValidImage now live in lib/imageValidation.ts
 * (pure, no AWS SDK import) so the client-side upload forms can run the
 * same check before ever calling fetch, instead of only finding out a
 * file's too big after the platform itself has already rejected the
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

// Lazily constructed, not at module load -- so importing this file never
// throws just because R2 env vars aren't set yet in some environment
// (e.g. a CI typecheck step, or a route that never actually calls
// uploadImageBuffer/deleteImage). The throw happens at the point one of
// those functions is actually called without configuration, which is a
// much clearer failure than "module import crashed at boot."
let r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  if (r2Client) return r2Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY missing)');
  }
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

export async function uploadImageBuffer(image: NormalizedImage, pathPrefix: string): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrl) {
    throw new Error('R2 is not configured (R2_BUCKET_NAME / R2_PUBLIC_URL missing)');
  }
  const key = `${pathPrefix}/${crypto.randomUUID()}.${image.ext}`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: image.buffer,
      ContentType: image.contentType,
    }),
  );
  return `${publicUrl}/${key}`;
}

/**
 * Whether `url` points at THIS project's own R2 custom domain, i.e. is
 * safe to fetch server-side (lib/safety/moderateAndUpload.ts's
 * moderateImageUrl) rather than a client-supplied URL that could point
 * anywhere -- a private IP, an internal service, a huge file meant to
 * exhaust memory. uploadImageBuffer() above is the only place that ever
 * creates a real photo URL, and every one it returns matches this
 * pattern. app/api/profile/route.ts's onboarding PUT is the one place a
 * photo URL arrives as a plain string in a request body instead of a
 * real file upload, so it's the one place that needs this check before
 * the URL is ever trusted or fetched -- see that route's photoUrls
 * schema.
 *
 * Deliberately an exact hostname match, not a wildcard pattern -- unlike
 * Vercel Blob (which allocated a random per-project subdomain, needing
 * `/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i`), this project
 * chose one fixed custom domain for R2 (media.findmyvybe.com, set up in
 * the Cloudflare dashboard against the findmyvybe-profile-pics bucket),
 * so there's no reason to allow anything broader than that one literal
 * hostname. Also already relied on by next.config.mjs's CSP img-src.
 */
export function isTrustedPhotoBlobUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.hostname === 'media.findmyvybe.com';
}

export async function deleteImage(url: string) {
  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket || !isTrustedPhotoBlobUrl(url)) return;
    const key = new URL(url).pathname.replace(/^\//, '');
    if (!key) return;
    await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Best-effort: an already-missing object (or a seeded external URL
    // that was never actually stored in R2, e.g. a pravatar.cc seed
    // photo -- see isTrustedPhotoBlobUrl's early return above) shouldn't
    // block deleting the Photo row itself.
  }
}

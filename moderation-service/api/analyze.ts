import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeImage, UndecodableImageError } from '../lib/imageAnalysis';

/**
 * POST /api/analyze -- the entire public surface of this service.
 * Auth: `Authorization: Bearer <MODERATION_SERVICE_SECRET>`, same
 * bearer-secret pattern as the main app's CRON_SECRET-protected cron
 * routes (see each app/api/cron/<name>/route.ts there).
 * Body: the raw image bytes, Content-Type: application/octet-stream.
 * Vercel's Node.js runtime hands that to us pre-parsed as a Buffer --
 * see https://vercel.com/guides/handling-node-request-body -- so there's
 * no multipart/form-data parsing or manual stream reading to do here.
 *
 * Response shapes (see ../../lib/safety/imageModeration.ts's
 * remoteImageModerationProvider in the main app for how each is
 * consumed):
 *  200 { faceCount, nudityScores: { porn, hentai, sexy } }  -- ModerationSignals
 *  401 { error: 'unauthorized' }                             -- bad/missing secret
 *  422 { error: 'undecodable_image', message }                -- corrupt/unsupported file, not an infra problem
 *  500 { error: '...', message }                              -- this service's own infra problem
 *
 * No photoId, no userId, no decision, no database -- the main app sends
 * bytes and gets signals back; everything about WHO this photo belongs
 * to and WHAT to do with the result stays there.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const secret = process.env.MODERATION_SERVICE_SECRET;
  if (!secret) {
    console.error('[api/analyze] MODERATION_SERVICE_SECRET is not set -- refusing to run unauthenticated.');
    res.status(500).json({ error: 'not_configured' });
    return;
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    res.status(400).json({ error: 'bad_request', message: 'Expected a non-empty application/octet-stream body.' });
    return;
  }

  try {
    const signals = await analyzeImage(buffer);
    res.status(200).json(signals);
  } catch (err) {
    if (err instanceof UndecodableImageError) {
      res.status(422).json({ error: 'undecodable_image', message: err.message });
      return;
    }
    console.error('[api/analyze] analysis failed', err);
    res.status(500).json({ error: 'analysis_failed', message: err instanceof Error ? err.message : String(err) });
  }
}

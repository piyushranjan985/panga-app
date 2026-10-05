/**
 * Parses a `fetch` Response as JSON, tolerating a response that has no
 * body at all. That's exactly what you get from an uncaught error in a
 * Next.js Route Handler in production -- Next deliberately returns a
 * bare 500 with an empty body (to avoid leaking a stack trace to the
 * client) -- or from a Vercel-level function crash/timeout. Calling
 * `res.json()` directly on one of those throws a generic, unhelpful
 * "Unexpected end of JSON input" that swallows the real HTTP status and
 * hides what actually went wrong; a caller that does
 * `if (!res.ok) throw new Error(data.error ?? '...')` never even reaches
 * that fallback message, because the `.json()` call itself already threw
 * first.
 *
 * A route handler throwing uncaught almost always means something it
 * depends on isn't configured in the environment it's running in --
 * e.g. `DATABASE_URL` (or another required secret) set for Production
 * but never added to Preview in the Vercel dashboard. This helper can't
 * fix that, but it surfaces the real HTTP status instead of a confusing
 * parse error, so the actual problem is visible instead of hidden.
 */
export async function parseJsonResponse(res: Response): Promise<any> {
  // `any`, matching `Response.json()`'s own return type -- every
  // existing call site already destructures whatever shape its own
  // route returns (`data.error`, `data.channel`, `data.alreadyHasProfile`,
  // ...), same as it did when calling `res.json()` directly.
  const text = await res.text();
  if (!text) {
    return { error: `Server error (${res.status}). Please try again in a moment.` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Unexpected response from server (${res.status}). Please try again.` };
  }
}

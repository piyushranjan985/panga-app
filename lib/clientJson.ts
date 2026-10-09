/**
 * Client-side-only helper: parse a fetch Response as JSON without
 * crashing when the body ISN'T JSON. Our own route handlers always
 * return JSON, even for errors -- but a platform-level failure (Vercel's
 * edge rejecting an oversized request body with a plain-text 413
 * "Request Entity Too Large", a 502/504 from an infra hiccup, etc.)
 * happens before our route handler code ever runs, and comes back as
 * plain text or HTML instead. `res.json()` throws on that
 * ("Unexpected token 'R', "Request En"... is not valid JSON" is exactly
 * what that throw looks like for a 413), which used to surface as a raw
 * JS parse error instead of a message a user could act on.
 *
 * Read as text first and parse by hand, so a non-JSON body becomes a
 * normal `{ error }` shape instead of an uncaught exception -- callers
 * keep their existing `if (!res.ok) throw new Error(data.error ?? ...)`
 * pattern unchanged. Generic and defaulting to `any`, same as the
 * `res.json()` calls this replaces -- callers already relied on that
 * looseness to read a success shape (`data.url`, `data.photo`, ...)
 * on the non-error path.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413) {
      return { error: 'That file is too large to upload.' } as T;
    }
    return { error: `Something went wrong on our end (status ${res.status}). Please try again.` } as T;
  }
}

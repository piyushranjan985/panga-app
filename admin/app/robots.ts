import type { MetadataRoute } from 'next';

// Belt-and-suspenders alongside next.config.mjs's X-Robots-Tag header:
// this staff-only portal has no reason to ever appear in search results.
// robots.txt alone wouldn't stop an already-indexed URL from staying
// indexed (some crawlers only re-check it periodically) -- the header is
// the stronger of the two, this just covers crawlers that look here
// first.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}

# Photo storage: cost & performance comparison — findmyVybe

Trigger: comparing Vercel Blob's Pro-tier economics against alternative object-storage providers for profile photos, since the Hobby-tier analysis in `docs/COMPONENTS_AND_SERVICES.md` found Blob Data Transfer (not storage) is the binding constraint for a swipe-heavy app. This doc looks at what changes on Pro, and whether a different provider does better on cost and/or performance for this specific access pattern — without touching the existing photo-validation security logic, which is provider-agnostic by design (see "What stays the same" below).

Pricing below is current as of checking (October 2026), gathered from Vercel's own docs plus third-party pricing write-ups for Cloudflare R2, Backblaze B2, AWS S3+CloudFront, and Cloudinary — Vercel's figures are primary-source; the others came from current blog analyses cross-checked against each other, not fetched directly from Cloudflare's/AWS's own pricing pages (blocked for direct fetch in this session), so treat the non-Vercel numbers as "very likely right, not contractually guaranteed" and re-verify on each provider's own pricing page before committing budget.

## findmyVybe's actual access pattern

- Up to 5 photos/profile, each up to 4MB (`MAX_UPLOAD_BYTES`), **no server/client-side resizing or compression currently applied** — so real photos likely run 0.5–4MB depending on the phone.
- Writes (uploads) happen once per photo, at signup/profile-edit — low frequency.
- Reads (views) happen constantly — every swipe-feed card, every match, every profile view fetches a photo. For a dating app this is a **read-heavy, bandwidth-dominated** workload: the number of times a photo is *viewed* vastly exceeds the number of times it's *uploaded*.

That access pattern is the whole story for which provider wins: the dominant cost driver here is egress/bandwidth (serving photos to viewers), not storage or upload volume. Any comparison that doesn't weight bandwidth heavily will give the wrong answer for this app.

## What stays the same no matter which provider is used

PKR asked that the photo-validation logic remain intact regardless of storage choice — it does, by construction. The security work from the audit pass is written against *concepts*, not Vercel specifically:

1. **`isTrustedPhotoBlobUrl()`** (`lib/upload.ts`) — currently a regex matching Vercel Blob's own hostname pattern (`*.public.blob.vercel-storage.com`). Migrating providers means swapping this one regex for the new provider's domain (e.g. a R2 custom domain or `*.r2.dev`) — the SSRF-prevention logic itself (only ever treat a URL as a real photo to fetch if it's `https://` and matches *our own* trusted storage domain) doesn't change.
2. **Content-Length pre-check** against the 4MB cap, before fetching (`lib/safety/moderateAndUpload.ts`) — plain HTTP header check, identical against any provider's response.
3. **Streamed read with a hard byte-count cap** (abort if actual bytes exceed 4MB even if `Content-Length` lied) — uses the standard `Response.body` stream API, identical against any provider.
4. **Zod `.refine(isTrustedPhotoBlobUrl, ...)`** on `photoUrls` at onboarding (`app/api/profile/route.ts`) — same pattern, just pointed at whichever validator is current.

A provider switch would also touch the CSP's `img-src` allowlist (currently scoped to Vercel Blob's hostname pattern, flagged in the security audit) — same update, add the new domain instead of/alongside the old one.

## Pricing comparison

| Provider | Storage | Write/upload ops | Read/view ops | Egress (bandwidth) | Free tier |
|---|---|---|---|---|---|
| **Vercel Blob (Pro)** | $0.023/GB-mo | $5.00/million (`put`/`copy`/`list`) | $0.40/million (cache-miss reads + `head()`) | $0.05/GB (iad1 region; varies by region) | No fixed free tier on Pro — a shared monthly usage credit covers all Vercel usage, then it's billed at these rates |
| **Cloudflare R2** | $0.015/GB-mo | $4.50/million (Class A) | $0.36/million (Class B) | **$0.00 — zero egress fee** | 10GB storage, 1M Class A ops, 10M Class B ops/month |
| **Backblaze B2** | $0.00695/GB-mo (cheapest storage) | Free | Free | Free up to 3x stored data; **$0 if fronted by Cloudflare/Fastly** (Bandwidth Alliance); otherwise $0.01/GB beyond the 3x allowance | 10GB storage/month |
| **AWS S3 + CloudFront** | $0.023/GB-mo (same as Blob — Blob is built on this exact stack) | $5.00/million (PUT) | $0.40/million (GET) | S3→CloudFront: free. CloudFront→internet: 1TB + 10M requests/month free (standing AWS free tier), then $0.085/GB | 100GB S3 direct egress free/month; CloudFront's 1TB/mo as above |
| **Cloudinary** | Bundled into a shared "credit" pool ($99/mo = 225 credits; 1 credit = 1GB storage *or* 1GB bandwidth *or* 1,000 transformations) | — | — | Comes out of the same credit pool | 25 credits/month free |

Cloudinary doesn't fit well here: it's priced for apps that want Cloudinary's own AI moderation/transformation pipeline, which findmyVybe already has self-hosted (nsfwjs + face-api) — paying ~$0.44/GB-equivalent (225 credits / $99) just for plain storage+bandwidth is 20–30x Cloudflare R2's rate for no added benefit in this app's architecture. Supabase Storage was also checked and isn't a clean fit either: its free tier is tiny (1GB storage / 5GB egress) and its pricing bundles database storage/egress into the same quotas in a way that's hard to isolate for file storage alone — not recommended here.

## What this means at actual traffic — worked example

Picking a deliberately round, illustrative scale (plug in your own real numbers once you have launch traffic data): **50GB stored** (roughly 10,000–25,000 photos, i.e. 2,000–5,000 full profiles), **500,000 uploads/month**, **5 million photo views/month**, **1TB (1,024GB) of actual bandwidth served** — a plausible early-growth month, not a guarantee:

| Provider | Storage | Ops | Bandwidth | **Total/month** |
|---|---|---|---|---|
| Vercel Blob (Pro) | $1.15 | $3.10 | $51.20 | **≈ $55/month** |
| Cloudflare R2 | $0.75 | $4.05 | $0.00 | **≈ $4.80/month** |
| Backblaze B2 (fronted by Cloudflare) | $0.35 | $0.00 | $0.00 | **≈ $0.35/month** |
| AWS S3 + CloudFront | $1.15 | $3.10 | $0.00 (within the 1TB free tier) | **≈ $4.25/month** |

The gap isn't close, and it only widens with scale, because Vercel Blob (and raw S3 without CloudFront's free tier) charge per GB served while R2 and Cloudflare-fronted B2 charge **nothing** for serving — the exact resource this app consumes the most of. Past CloudFront's 1TB/month free allowance, S3+CloudFront's overage ($0.085/GB) also starts costing real money, while R2 stays at $0 indefinitely.

## Performance

- **Vercel Blob**: already integrated, zero config, served through Vercel's own edge/CDN caching (Fast Origin Transfer). Perfectly fine performance; the only question is cost at scale, not speed.
- **Cloudflare R2**: Cloudflare operates one of the largest edge networks globally with a strong points-of-presence footprint across India specifically (Mumbai, Delhi NCR, Bangalore, Chennai, Kolkata, and more) — a good match for an India-focused Gen Z audience. R2 objects are served through Cloudflare's CDN natively (no separate CDN to configure), the same network already fronting most of the public internet.
- **Backblaze B2**: B2's own network is smaller; best practice (and the only way to get the free egress) is fronting it with Cloudflare anyway — so you end up running two services (object store + CDN) instead of one. More moving parts for marginally cheaper storage than R2.
- **AWS S3 + CloudFront**: excellent performance and strong India presence, but the most moving parts to manage (two separate AWS services, IAM policies, cache invalidation rules) versus Vercel Blob's near-zero config or R2's single native service.

## Recommendation

**Cloudflare R2** is the standout for this specific app: zero egress fee at any scale (directly targets this app's dominant cost driver), S3-compatible API (same interface as AWS S3 — a hedge against future lock-in, and a well-trodden migration path if ever needed), a generous free tier (10GB storage, 1M/10M ops/month), and a CDN footprint well-suited to an India-first audience. Backblaze B2 is cheaper still on raw storage and worth a look if storage volume (not bandwidth) ever dominates, but needs Cloudflare fronting for the free-egress benefit anyway, so it's strictly more setup than R2 for a smaller win in this app's read-heavy profile.

**Vercel Blob is not wrong to keep right now** — it's zero migration effort, works today, and at current (near-zero) traffic the dollar difference is trivial. The decision point is *timing*: migrate before real swipe traffic arrives (cheap to do with no live users depending on the URLs yet) rather than after (same migration, but now against live traffic and existing photo URLs that need redirecting/copying without breaking anyone's profile).

## If a migration is wanted

Scope, at a glance — none of it touches the validation logic described above, only where photos are stored and served from:

1. Create an R2 bucket + a custom public domain for it (e.g. `media.findmyvybe.com`) in Cloudflare.
2. Swap the upload path: replace `@vercel/blob`'s `put()`/client-upload-token flow with R2's S3-compatible API (`@aws-sdk/client-s3` pointed at R2's endpoint, or Cloudflare's own upload-URL pattern).
3. One-time data migration: copy existing blobs from Vercel Blob to R2 (scriptable — list existing URLs from the DB, fetch each, re-upload to R2), then switch `photoUrls` in the DB to the new domain.
4. Update `isTrustedPhotoBlobUrl()`'s regex and the CSP `img-src` directive to the new domain (alongside the old one during the migration window, then remove the old one once migration is confirmed complete).
5. Cut over, verify, then decommission the Vercel Blob store.

This is a genuine (if contained) engineering task, not a config flip — happy to scope and build it when you're ready to say go.

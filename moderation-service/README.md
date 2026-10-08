# findmyvybe-moderation-service

Phase-1 microservice extraction from `findmyvybe-app`. See
`../docs/MODERATION_SERVICE.md` in the main repo for the full writeup --
this file is just the quick-start.

**What this is**: the ML inference step of photo moderation (nsfwjs
nudity classification + face-api face counting) as its own deployable,
with its own Vercel project. **What this is NOT**: a decision-maker. It
never sees a user ID, a photo ID, or a database -- it takes image bytes
over HTTP and returns raw signals. The main app's
`lib/safety/policyEngine.ts` still decides APPROVED / REJECTED /
MANUAL_REVIEW, and still owns every `Photo` / `ModerationCase` row.

## Deploying (one-time)

1. In the Vercel dashboard, **Add New Project** from this same Git repo,
   same as `admin/` already is. Set **Root Directory** to
   `moderation-service`.
2. Set one environment variable on **this** project (Production +
   Preview): `MODERATION_SERVICE_SECRET` -- any long random string, e.g.
   `openssl rand -hex 32`.
3. Deploy. Note the resulting URL (e.g.
   `https://findmyvybe-moderation.vercel.app`).
4. On the **main** `findmyvybe-app` project, set two more env vars
   (Production + Preview):
   - `IMAGE_MODERATION_SERVICE_URL` = that URL from step 3
   - `IMAGE_MODERATION_SERVICE_SECRET` = the exact same string from step 2
5. Still on the main app, leave `IMAGE_MODERATION_PROVIDER=self-hosted`
   for now. Test this service directly first (see below), then flip it
   to `IMAGE_MODERATION_PROVIDER=remote` and redeploy only once you've
   confirmed it works -- the old in-process path keeps working the whole
   time you're testing, nothing is removed yet.

## Testing it directly

```
curl -X POST "https://<this-service>.vercel.app/api/analyze" \
  -H "Authorization: Bearer <MODERATION_SERVICE_SECRET>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/path/to/a/test/photo.jpg"
```

Expect `{"faceCount":1,"nudityScores":{"porn":0.0…,"hentai":0.0…,"sexy":0.0…}}`
for a normal face photo.

## Local dev

```
npm install
npm run dev   # vercel dev -- needs the Vercel CLI and MODERATION_SERVICE_SECRET set locally
```

## Cost

Runs on Vercel's free Hobby tier functions (same 2GB/300s budget the
main app's self-hosted provider already runs within today) with no
database of its own -- this extraction adds no new paid infrastructure.
One caveat worth knowing regardless of this specific change: Vercel's
Hobby plan terms restrict it to personal/non-commercial use, which is a
question about the whole project's hosting, not something this
extraction changes either way.

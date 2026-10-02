# Push Notifications — Design Spec

Status: **Decided — ready for implementation** (all open questions
resolved 2026-10-02, see §7)
Owner: Product / Platform
Related: `prisma/schema.prisma` (`NotificationTemplate`), `admin/lib/configApproval.ts`
(already flags `NotificationTemplate` as "not read by the consumer app yet —
wiring actual runtime checks... is follow-up work outside this portal's own
scope" — this spec is that follow-up), `capacitor.config.ts`, `lib/native.ts`

## 0. Provider: Firebase Cloud Messaging (FCM), for all three surfaces

One provider, not three. FCM covers Android (native), iOS (native, via APNs
credentials uploaded into the same Firebase project), and web push (FCM has
its own web SDK, so there's no separate VAPID/raw-Web-Push-API system to
stand up) — one Firebase project, one backend send path
(`lib/notifications/push.ts`, next to the existing `email.ts`/`sms.ts`),
one `DeviceToken` table regardless of which platform a token came from.
Confirmed free with no message-count limit and no per-message fee on
either Firebase tier — fits the budget approach already used everywhere
else in this app (DigiLocker, self-hosted moderation, Brevo's free tier).
The only real cost is the same one every provider in this app has had: a
Google/Firebase account to create yourself, which I can't do on your
behalf.

## 1. Do iOS, Android, and web all require explicit permission? Yes — answering that directly

All three require the person to explicitly opt in; none of them let an app
start pushing notifications silently.

- **iOS (native app):** Capacitor's `PushNotifications.requestPermissions()`
  triggers Apple's system dialog ("findmyVybe Would Like to Send You
  Notifications") — no notifications without an explicit Allow. Apple's App
  Store review guidelines also expect this to be asked at a sensible,
  contextual moment (e.g. after someone gets their first match), not
  immediately on first launch — not a hard technical block, but reviewers
  do flag apps that ask too eagerly.
- **Android (native app):** Android 13+ (API 33, which is what any current
  build targets) requires the same kind of explicit runtime permission
  (`POST_NOTIFICATIONS`) as iOS — this is a relatively recent change (older
  Android versions allowed notifications by default, opt-out only via
  Settings). Capacitor's plugin asks through the same
  `requestPermissions()` call, so this is one code path for both native
  platforms.
- **Web (Android Chrome / desktop browsers):** the standard
  `Notification.requestPermission()` browser prompt — same idea, explicit
  opt-in, no install required.
- **Web on iOS Safari — the one real platform gap:** iOS Safari does not
  support web push in an ordinary browser tab at all. It only works if the
  site has first been "Added to Home Screen" as an installed PWA
  (iOS 16.4+) — a regular visit to findmyvybe.com in Safari can never
  prompt for push permission on iOS. See §3 for why this doesn't actually
  cost anything here.

## 2. Data model

```prisma
model DeviceToken {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String    @unique // the FCM registration token itself
  platform   String    // 'ios' | 'android' | 'web'
  createdAt  DateTime  @default(now())
  lastSeenAt DateTime  @default(now()) // bumped on each app/tab open, not each send
  revokedAt  DateTime? // FCM returned "not registered" on a send -- stale, stop using

  @@index([userId])
}
```

One user can hold several tokens at once (phone + laptop browser, say) —
a send fans out to every non-revoked token for that user, which is the
normal FCM pattern, not something special to build.

`NotificationTemplate.channel` (currently `'email' | 'sms' | 'in_app'`)
gets a fourth value, `'push'`, so admin-authored notification copy (title
+ body) flows through the same template/approval system
`admin/components/ProposeNotificationTemplateForm.tsx` already provides —
reusing that system is the actual point of the `configApproval.ts` comment
referenced above, not a new admin surface.

## 3. Why iOS web push isn't worth building

Given §1's constraint (home-screen install required, or no web push at all
on iOS), and that findmyVybe already ships a real native iOS app via
Capacitor: an iOS user either has the app installed, in which case they get
real native push with no install-to-home-screen friction anyway, or they
don't, in which case asking them to "Add to Home Screen" a *website* just
to get notifications is a worse ask than "download the app" — a path that
already exists and already works better. So the proposal is: **native push
(FCM) for the iOS and Android apps, web push (FCM web SDK) for Android
Chrome and desktop browser visitors only** — not a gap, a deliberate scope
cut that costs nothing real.

## 4. What triggers a notification — final list, see §7 for how this was decided

1. New match (`Match` created)
2. New message, when the recipient isn't actively viewing that chat (§7.2)
3. A Vybe Vouch response comes back (see `docs/VYBE_VOUCH.md` §5 — this was
   already flagged there as "a future notification pass... would cover this
   for free")
4. Identity verification resolves (`IdentityVerification.status` ->
   `VERIFIED` or a terminal failure)
5. A date-feedback nudge, ~2 days after the most recent `PLAN`-kind
   message in a match with no `DateFeedback` yet (§7.1's design note —
   this one runs off a daily cron scan, not an instant event, since
   there's no stored meetup date to hook an instant trigger to)

Explicitly excluded: one-sided swipes/likes, unmatches, growth/
re-engagement nudges (§7.1).

Each needs a `NotificationTemplate` row (title/body, with simple
placeholders like `{{name}}`) so copy can be tuned from the admin portal
without a redeploy, matching how `email`/`sms` templates already work
there.

## 5. Settings / opt-out

A simple per-category toggle (Matches & Messages / Vybe Vouch / Reminders),
not a granular per-event-type settings screen — stored as a few booleans on
`Profile` (cheapest option, matches how `quietMode` already lives there) or
a small `NotificationPreference` row if the list of categories grows.
Default: all on, since the OS/browser-level permission prompt in §1 is
already the real gate — someone who said "Allow" at the OS level is
opting in to the category of thing this app does, and in-app settings are
for fine-tuning after that, not a second permission gate.

## 6. The one implementation consequence worth sequencing around

Adding `@capacitor/push-notifications` is native code, not a web change —
it requires `npx cap sync`, a new Xcode/Android Studio build, and a new
App Store / Play Store submission, same one-time cost any native plugin
addition has (see `docs/VYBE_VOUCH.md`'s §8 for why everything *else* in
that feature avoided this). Practical sequencing: **web push for
Android/desktop browser users can ship entirely server + web side, with
zero native rebuild and zero store review**, the same way every other
feature to date has shipped. Native push for the iOS/Android apps is the
one piece that has to wait on a store review cycle (Apple's review in
particular can take a few days) — so Phase 1 below gets real value live
immediately instead of everything blocking on that round-trip.

## 7. Decisions and open items

2. **Message notifications while actively chatting — DECIDED: suppress.**
   A push for a message in a chat the recipient currently has open gets
   suppressed, not sent. Needs a cheap "is this match's chat currently
   open" signal — e.g. the chat page marks itself open on mount/visible
   and closed on unmount/background, written somewhere short-lived
   (in-memory per server instance is wrong for a multi-instance Vercel
   deployment — use a `lastOpenedAt`-style timestamp on a row keyed by
   `(userId, matchId)`, checked for recency at send time, rather than a
   literal open/closed boolean that could get stuck "open" if a tab closes
   without a clean unmount).
3. **Settings granularity — DECIDED: Vybe Vouch keeps its own toggle.**
   Confirms §5's original three categories (Matches & Messages / Vybe
   Vouch / Reminders) as proposed — not folded into "Matches & Messages."
4. **Timing — DECIDED: build together.** Vybe Vouch (`docs/VYBE_VOUCH.md`,
   currently spec-only, no schema/code yet) and Push Notifications get
   implemented as one combined build rather than staggered, so the Vybe
   Vouch response trigger ships from day one instead of being bolted on
   later. Practical build order (Vybe Vouch's data has to exist before
   push can trigger off it, not a reordering of priority): Vybe Vouch's
   schema + API routes + page first, then `DeviceToken` + `lib/notifications/push.ts`
   + the `'push'` template channel, then the chat-screen entry point and
   notification triggers for both features together. §8 below reflects
   this combined order.

1. **Trigger list — still open, clarifying what this question actually
   means before you answer it.** "Trigger list" means: which app events
   get an admin-authored `NotificationTemplate` and fire a push the
   moment they happen. Concretely, for the three already proposed:

   - **New match** — fires once, to both participants, the moment a
     `Match` row is created. Something like *"You and {{name}} matched! 💕"*.
   - **New message** — fires to the recipient when a `Message` is
     created, unless §7.2's suppression applies. Privacy question buried
     in this one: does the push preview show the message text (*"{{name}}:
     {{messageText}}"* — richer, but that text then sits on someone's lock
     screen, possibly in front of family) or stay generic (*"New message
     from {{name}}"* — safer default, matches how this app already treats
     photos/identity conservatively elsewhere). Proposing generic as the
     default unless you want richer previews.
   - **Vybe Vouch response** — fires to the inviter only, when a
     `VybeVouchResponse` is created. Also proposing generic copy here on
     purpose (*"{{vetterLabel}} responded to your Vybe Vouch"*, not the
     reaction itself) — the reaction/note are meant to be seen inside the
     app in a private panel (`docs/VYBE_VOUCH.md` §5), not broadcast onto
     a lock screen.

   That's the proposed starting set. Candidates I deliberately left OUT,
   worth an explicit yes/no each rather than assuming:

   - **Someone swiped right on you (before a mutual match)** — most
     dating apps intentionally do NOT notify on a one-sided like, to keep
     the "it's mutual!" moment of a match as the actual payoff and avoid
     the anxiety/pressure of "someone's waiting on me." Proposing to leave
     this out.
   - **You got unmatched** — no proposed notification; there's no version
     of this that helps the person receiving it.
   - **Identity verification result** (DigiLocker check approved/failed) —
     a real candidate for inclusion, account-lifecycle rather than
     social — currently NOT in the proposed list, could be added.
   - **Date-feedback nudge** (a day or two after a planned meetup,
     prompting the existing `DateFeedback` flow) — a real candidate,
     currently NOT in the proposed list.
   - **Re-engagement / growth nudges** ("3 new people joined in Bangalore
     this week," "you haven't opened the app in a while") — a genuinely
     different category from the others above: those are all "something
     happened that involves you specifically," this is marketing-flavored
     and more likely to feel spammy if overdone. Currently NOT proposed,
     and if you want this eventually, I'd suggest treating it as its own
     later decision (maybe its own §5 toggle, defaulted OFF rather than
     ON) rather than folding it into this round.

   **DECIDED (2026-10-02):** one-sided swipe and unmatch stay excluded.
   Growth/re-engagement nudges stay excluded for now (revisit as its own
   later decision). Identity verification result and the date-feedback
   nudge are BOTH added. Generic (not content-preview) copy confirmed for
   message and Vybe Vouch pushes. Final trigger list, five items:

   1. New match
   2. New message (generic copy, suppressed per §7.2 when that chat is open)
   3. Vybe Vouch response (generic copy)
   4. Identity verification result — fires when `IdentityVerification.status`
      resolves to `VERIFIED` or a terminal failure state. *"You're
      verified! ✅"* / a softer failure message pointing back to the
      verification flow rather than naming the specific reason (that detail
      stays in-app, same conservative instinct as message-preview copy).
   5. Date-feedback nudge — see the note below, since this one needed a
      real design decision of its own, not just a yes/no.

   **Design note on the date-feedback nudge:** there's no stored "planned
   meetup date" anywhere in this schema — `getPlanFlow()`
   (`lib/vybeContent.ts`) and the `PLAN`-kind `Message.meta` it produces
   capture *that* two people picked an activity together, not *when*
   they're doing it. Adding a real date/time field would be a bigger
   change than this spec's scope. Proposed proxy, grounded in what
   actually exists: trigger ~2 days after the most recent `PLAN`-kind
   message in a match, IF that match has no `DateFeedback` row yet for
   either participant by then. Needs a daily scan (Vercel Cron, same
   pattern as `admin/app/api/cron/retention-purge/route.ts`), not an
   instant event-trigger like the other four — see §8 Phase 2.

## 8. Rollout — status: building now (2026-10-02)

Combined build per §7.4 — Vybe Vouch and Push Notifications ship together,
not staggered. All four phases are being built in this pass; only Phase 4's
actual store submission is PKR's own manual step (new Firebase project,
APNs key, Xcode/Android Studio build, App Store/Play Store review — the
same category of PKR-only step as creating the MSG91/Brevo/StartMessaging
accounts earlier, not something the code side can do on its own).

- **Phase 1** — Vybe Vouch's schema (`VybeVouchInvite`/`VybeVouchResponse`),
  API routes, and unauthenticated page (`docs/VYBE_VOUCH.md` §2-4), behind
  its own `FeatureFlag`, exercised with PKR's own test accounts.
- **Phase 2** — `DeviceToken` schema, `lib/notifications/push.ts` (FCM
  send, reusing the provider-facade pattern from `lib/notifications/sms.ts`),
  the `'push'` `NotificationTemplate` channel, the daily cron scan for the
  date-feedback nudge (§4.5), and **web push only** (Android Chrome /
  desktop) for all five triggers — ships with a normal Vercel deploy, no
  store review needed, behind its own `FeatureFlag`.
- **Phase 3** — chat-screen entry points for both features (Vybe Vouch's
  "Get a Vybe Vouch" action, push permission prompting, the 3 settings
  toggles from §5), still web-only, still no store review.
- **Phase 4** — `@capacitor/push-notifications` dependency and native
  permission-request code path added to this codebase; the actual Firebase
  project, APNs key, native build, and store submission are PKR's to do
  (see note above) — the one phase that actually needs the store-review
  round-trip (see §6).

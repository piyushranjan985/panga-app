# Push Notifications — Design Spec

Status: **Design — proposed defaults below, open questions in §7 before
implementation starts**
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

## 4. What triggers a notification (proposed, not exhaustive — see §7)

Reusing events this app already has, no new signal needed:

- New match (`Match` created)
- New message, when the recipient isn't actively viewing that chat
- A Vybe Vouch response comes back (see `docs/VYBE_VOUCH.md` §5 — this was
  already flagged there as "a future notification pass... would cover this
  for free")
- Optionally, later: a `DateFeedback` nudge a day or two after a planned
  meetup, an identity-verification result

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

## 7. Open questions before implementation starts

1. **Trigger list** — is §4's list (match, message, Vybe Vouch response)
   the right starting set, or should it be narrower/broader for launch?
2. **Message notifications while actively chatting** — suppress a push for
   a message in a chat the recipient currently has open (needs a cheap
   "is this match's chat currently open" signal, e.g. a short-lived flag
   set on chat-page mount) or just always send and accept the minor
   redundancy for MVP simplicity?
3. **Settings granularity** — §5's three categories, or should Vybe Vouch
   responses just fall under "Matches & Messages" rather than being its
   own toggle?
4. **Timing** — build this now, or after Vybe Vouch ships (since §4 lists
   a Vybe Vouch trigger, but push doesn't have to launch with every
   trigger it'll eventually support — could ship Phase 1 with just
   match/message and add the Vybe Vouch trigger once both features exist)?

## 8. Rollout

- **Phase 1** — `DeviceToken` schema, `lib/notifications/push.ts`
  (FCM send, reusing the provider-facade pattern from `lib/notifications/sms.ts`),
  the `'push'` `NotificationTemplate` channel, and **web push only**
  (Android Chrome / desktop) — ships with a normal Vercel deploy, no store
  review needed, behind a `FeatureFlag`.
- **Phase 2** — `@capacitor/push-notifications` added, Firebase iOS/Android
  config wired in, permission-request UX added to the native apps, new
  builds submitted to both stores.
- **Phase 3** — expand trigger coverage per §7.1, add Vybe Vouch's trigger
  once that feature is live.

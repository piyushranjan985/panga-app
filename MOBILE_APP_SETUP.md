# VybeMatch on iOS & Android

VybeMatch ships to the App Store and Play Store as a **Capacitor "remote
URL" app**: the native iOS/Android shells load your live Vercel deployment
directly (same login, same chat, same database) and layer on native device
APIs where it matters -- starting with location for the distance feature
(see `lib/native.ts`). Nothing about the Next.js app or its backend
changes; you keep deploying to Vercel exactly as today.

This is a standard, fully-supported Capacitor pattern (not a hack) --
it's how a lot of full-stack web apps get real store listings without a
second codebase.

## Why this path instead of a rewrite

Your whole product (40+ screens worth of onboarding, discovery, matching,
chat) is already built in Next.js/React. A React Native rewrite means
re-building every one of those screens in a second codebase and
maintaining two frontends forever. Capacitor reuses ~100% of what's
already built; the trade-off is it's a WebView, not fully native widgets
-- for a chat/dating app (mostly forms, lists, and messaging, not games or
heavy animation) that trade-off is a good one, and it's what plenty of
production apps ship with.

## What I couldn't do for you

I did everything I could without a real network connection or a macOS
build environment: `capacitor.config.ts`, `lib/native.ts` (the native
bridge, wired into the Profile screen's location sharing), and the
`package.json` entries for the Capacitor packages. I could not run `npm
install`, `npx cap add ios/android`, or an actual Xcode/Gradle build --
those need real internet access and, for iOS, a Mac running Xcode, none
of which this session has. Everything below is exact commands for you.

## One-time setup

Run this from the project folder in your own Terminal:

```bash
npm install                       # pulls in the @capacitor/* packages just added to package.json

npx cap init                      # if it asks, appId: app.vybematch.mobile, appName: VybeMatch
                                   # (already set in capacitor.config.ts -- this just confirms)
```

**Before going further**, open `capacitor.config.ts` and replace
`server.url` with your actual production domain (the same one
`NEXT_PUBLIC_APP_URL` points at) -- the native shells load whatever URL
is there.

```bash
npx cap add ios                   # generates the ios/ Xcode project -- needs a Mac
npx cap add android               # generates the android/ Gradle project
npx cap sync                      # copies capacitor.config.ts + plugins into both native projects
```

`ios/` and `android/` are real native project folders (Xcode project,
Gradle project) -- commit them to git like any other source.

## iOS: what you need

- A Mac with **Xcode** installed (App Store, free) -- this cannot happen
  in this cloud session or in the device_bash sandbox, which is Linux,
  not macOS.
- An **Apple Developer Program** account ($99/year) -- required for
  TestFlight and App Store submission, not just for local testing on your
  own phone (a free account can side-load to your own device for a week
  at a time, which is fine for early testing).
- Run `npm run cap:ios` to open the project in Xcode, then set your Team
  (Signing & Capabilities tab) and Bundle Identifier (matches
  `capacitor.config.ts`'s `appId`), then Run.
- App icon + splash screen: `npx @capacitor/assets generate` from a
  1024x1024 source icon (see Capacitor's docs -- this generates every
  required size automatically).

## Android: what you need

- **Android Studio** (free) -- Gradle builds can technically run from the
  command line with just a JDK + the Android SDK command-line tools, but
  Android Studio is the path of least friction for signing and the first
  build.
- A **Google Play Console** account ($25 one-time).
- Run `npm run cap:android` to open the project in Android Studio, build
  a signed AAB (Build > Generate Signed Bundle), upload it to Play
  Console's Internal Testing track first.

## App Store / Play Store review, for a dating app specifically

Two things worth knowing going in:

- **Apple's Guideline 4.2 (Minimum Functionality)** can reject an app
  that's "just a repackaged website." The native location integration
  (`lib/native.ts`) and the plan is to add push notifications next (see
  below) are what keep this from reading as a thin wrapper -- don't skip
  those.
- **User-generated-content apps need moderation tools** (Apple 1.2, and
  Google has an equivalent policy) -- blocking, reporting, and a way to
  filter objectionable content. You already have all of this (Block,
  Report, Unmatch, the Safety panel from the post-match rebuild), which
  is a real plus for review, not something to build from scratch.
- Dating apps also typically need an **age rating of 17+/Mature** and
  **age verification at signup** (VybeMatch's 18+ date-of-birth check in
  onboarding already covers the basic requirement).

## Recommended next step: push notifications

Right now, someone has to have the app open to see a new match or
message. Push notifications (new match, new message, "someone answered
your Vybe") are the single biggest thing that will make this feel like a
real app rather than a bookmark -- and they also strengthen the
Guideline-4.2 case above. This needs: `@capacitor/push-notifications`,
an Apple Push Notification (APNs) key from your Developer account, a
Firebase project for Android (FCM), and a small backend piece (store each
signed-in device's push token, call it when a message/match is created).
It's a real second phase of work, deliberately not included here --
happy to build it whenever you're ready, most likely as a Vercel
serverless function triggered from the existing `/messages` and `/swipe`
routes.

## Testing loop while you iterate

Since the app loads your live URL, most day-to-day work (styling, new
features, bug fixes) needs **no native rebuild at all** -- push to
`main`, Vercel redeploys, and the next time someone opens the app it's
already updated, exactly like the web version. You only need to redo
`npx cap sync` + a native rebuild when you change `capacitor.config.ts`
itself or add/update a native plugin.

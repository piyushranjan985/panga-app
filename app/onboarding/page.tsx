'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import InactivityLogout from '@/components/InactivityLogout';
import {
  CITIES,
  DATE_VIBES,
  TONIGHT_OPTIONS,
  VALUES_OPTIONS,
  LIVING_PREFERENCES,
  FUTURE_VIBE_QUESTIONS,
  CHILDREN_OPTIONS,
} from '@/lib/constants';
import IntentBadge from '@/components/IntentBadge';
import EmailVerifyField from '@/components/EmailVerifyField';
import { assertValidImage } from '@/lib/imageValidation';
import { safeJson } from '@/lib/clientJson';

type Interest = { id: string; label: string; emoji: string; intents: string[] };
type Prompt = { id: string; text: string; emoji: string; optionA: string; optionB: string; intents: string[] };
type Tribe = { id: string; slug: string; label: string; emoji: string; intents: string[] };
type SubCommunity = { id: string; tribeId: string; label: string };
type RelationshipStyle = { id: string; label: string; emoji: string };

const INTENTS = [
  { value: 'JUST_VIBING', label: 'Just Vibing', emoji: '\ud83d\udcab', blurb: 'Meet, date, have fun \u2014 no heavy expectations' },
  { value: 'SOMETHING_REAL', label: 'Something Real', emoji: '\u2764\ufe0f', blurb: 'Find a meaningful long-term partner' },
  { value: 'RISHTA_READY', label: 'Rishta Ready', emoji: '\ud83d\udc8d', blurb: 'Find someone compatible for marriage & family life' },
];

// Onboarding is intent-specific: the first two real steps (Basics, Photos)
// are identical for all three, then the flow progressively diverges --
// Just Vibing skips Tribe entirely for a lighter Date Vibe/Tonight layer;
// Something Real gets the full Tribe + Relationship Vibe layer; Rishta
// Ready gets Tribe plus the marriage-facing Values/Future Vibe layer. Every
// flow ends on a "ready" recap screen instead of finishing silently on the
// last question. See lib/constants.ts for the per-intent data behind each
// step.
type StepKey =
  | 'intent'
  | 'basics'
  | 'photos'
  | 'interests'
  | 'tribe'
  | 'relationship'
  | 'datevibe'
  | 'tonight'
  | 'values'
  | 'future'
  | 'vybecheck'
  | 'familypreview'
  | 'ready';

const STEP_LABELS: Record<StepKey, string> = {
  intent: 'Intent',
  basics: 'Basics',
  photos: 'Photos',
  interests: 'Interests',
  tribe: 'Tribe',
  relationship: 'Relationship',
  datevibe: 'Date Vibe',
  tonight: 'Tonight',
  values: 'Values',
  future: 'Future',
  vybecheck: 'Vybe Check',
  familypreview: 'Family Preview',
  ready: 'Your Vybe',
};

type IntentValue = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';

const STEP_FLOWS: Record<IntentValue, StepKey[]> = {
  JUST_VIBING: ['intent', 'basics', 'photos', 'interests', 'datevibe', 'tonight', 'vybecheck', 'ready'],
  SOMETHING_REAL: ['intent', 'basics', 'photos', 'interests', 'tribe', 'relationship', 'vybecheck', 'ready'],
  RISHTA_READY: [
    'intent',
    'basics',
    'photos',
    'interests',
    'tribe',
    'values',
    'future',
    'vybecheck',
    'familypreview',
    'ready',
  ],
};

// form.intent is stored as a plain string (it round-trips through a
// <select>-free button group and the API as IntentType), but is only ever
// set to one of the three INTENTS values below -- safe to assert.
function stepsForIntent(intent: string): StepKey[] {
  return STEP_FLOWS[intent as IntentValue] ?? STEP_FLOWS.SOMETHING_REAL;
}

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  // Set when this page was reached via the Profile screen's "switch intent"
  // link (?switchIntent=RISHTA_READY etc.) rather than fresh signup --
  // prefills the shared fields from the existing profile, clears the old
  // intent's data, and jumps straight past Intent/Basics/Photos so someone
  // isn't re-typing their bio to change their tribe. minStep keeps "Back"
  // from wandering into the skipped steps.
  const [editMode, setEditMode] = useState(false);
  const [minStep, setMinStep] = useState(0);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [subCommunities, setSubCommunities] = useState<SubCommunity[]>([]);
  const [relationshipStyles, setRelationshipStyles] = useState<RelationshipStyle[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Required at the Bio (basics) step for a brand-new signup -- not
  // re-required for an existing account revisiting basics via
  // switchIntent (see nextDisabled below). Seeded from /api/profile's
  // account.email/emailVerified on mount so a page refresh mid-onboarding
  // doesn't ask again for an email already verified in a previous visit.
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const [form, setForm] = useState({
    displayName: '',
    dateOfBirth: '',
    gender: 'WOMAN',
    lookingFor: ['MAN'] as string[],
    city: CITIES[0],
    bio: '',
    intent: 'SOMETHING_REAL',
    interestIds: [] as string[],
    tribeIds: [] as string[],
    subCommunityIds: [] as string[],
    relationshipStyleIds: [] as string[],
    promptAnswers: [] as { promptId: string; answer: string }[],
    familyPreviewOn: false,
    photoUrls: [] as string[],
    avatarHue: Math.ceil(Math.random() * 6),
    // Just Vibing only
    dateVibeTags: [] as string[],
    tonightTags: [] as string[],
    // Rishta Ready only
    livingPreference: '',
    valuesTags: [] as string[],
    futureHome: '',
    futureFamily: '',
    futureCareer: '',
    futureMoney: '',
    children: '',
  });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [finishNotice, setFinishNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/onboarding-options')
      .then((r) => r.json())
      .then((d) => {
        setInterests(d.interests ?? []);
        setPrompts(d.prompts ?? []);
        setTribes(d.tribes ?? []);
        setSubCommunities(d.subCommunities ?? []);
        setRelationshipStyles(d.relationshipStyles ?? []);
      });
    // Known as soon as someone's signed in (from the OTP/social step, well
    // before a Profile row exists) -- fetched here only to preview the
    // Family Preview link before they've finished onboarding.
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMyUserId(d.userId ?? null));
    // account.email/emailVerified come back here even with no Profile row
    // yet (it's User-level, not Profile-level) -- seeds verifiedEmail so
    // the basics step's email gate (see nextDisabled) already knows about
    // an email verified earlier in this same onboarding session.
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        if (d.account?.email && d.account?.emailVerified) setVerifiedEmail(d.account.email);
      });
  }, []);

  // Reached from the Profile screen's intent switcher: pull the existing
  // profile and prefill the shared fields, drop everything intent-specific
  // (see selectIntent above for why), and skip to the first step that
  // actually differs for the new intent.
  useEffect(() => {
    const target = searchParams.get('switchIntent');
    if (!target || !['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY'].includes(target)) return;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        const p = d.profile;
        if (!p) return;
        setForm((f) => ({
          ...f,
          displayName: p.displayName ?? f.displayName,
          dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : f.dateOfBirth,
          gender: p.gender ?? f.gender,
          lookingFor: p.lookingFor ?? f.lookingFor,
          city: p.city ?? f.city,
          bio: p.bio ?? f.bio,
          intent: target,
          interestIds: (p.interests ?? []).map((i: { id: string }) => i.id),
          familyPreviewOn: p.familyPreviewOn ?? f.familyPreviewOn,
          photoUrls: (p.photos ?? []).slice().sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((ph: { url: string }) => ph.url),
          avatarHue: p.avatarHue ?? f.avatarHue,
          // Everything below is intent-specific -- start clean under the
          // new intent rather than carrying over the old one's picks.
          tribeIds: [],
          subCommunityIds: [],
          relationshipStyleIds: [],
          promptAnswers: [],
          dateVibeTags: [],
          tonightTags: [],
          livingPreference: '',
          valuesTags: [],
          futureHome: '',
          futureFamily: '',
          futureCareer: '',
          futureMoney: '',
          children: '',
        }));
        // Switching TO Rishta Ready must land on Basics, not Interests --
        // Basics is where the "Where do you see yourself living?" question
        // lives (see the RISHTA_READY-only block in the basics step JSX),
        // and it's required to finish (see flowIncomplete below). Skipping
        // straight to Interests meant livingPreference stayed empty with
        // no way back (minStep clamps the Back button), which permanently
        // disabled the final "ready" screen's Finish button -- the flow
        // looked "stuck" with no way to complete it. Switching to the
        // other two intents doesn't need this question, so they still
        // jump straight to Interests as before.
        const entryStepKey = target === 'RISHTA_READY' ? 'basics' : 'interests';
        const entryStep = stepsForIntent(target).indexOf(entryStepKey);
        const start = entryStep >= 0 ? entryStep : 0;
        setStep(start);
        setMinStep(start);
        setEditMode(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle<T>(list: T[], value: T, max: number): T[] {
    if (list.includes(value)) return list.filter((v) => v !== value);
    if (list.length >= max) return list;
    return [...list, value];
  }

  // Same 18-100 window app/api/profile/route.ts enforces server-side -- this
  // just keeps someone from ever being able to *pick* an invalid date in
  // the first place, rather than finding out at the very last onboarding
  // step that today's selection doesn't count.
  function isoDateYearsAgo(years: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
  }
  const maxDob = isoDateYearsAgo(18); // today minus 18 years = latest allowed DOB
  const minDob = isoDateYearsAgo(100);

  function ageFromDob(dob: string): number {
    const ms = Date.now() - new Date(dob).getTime();
    return ms / (365.25 * 24 * 60 * 60 * 1000);
  }
  const dobTooYoung = form.dateOfBirth ? ageFromDob(form.dateOfBirth) < 18 : false;
  const age = form.dateOfBirth && !dobTooYoung ? Math.floor(ageFromDob(form.dateOfBirth)) : null;

  // The first two real steps (Basics, Photos) are identical for every
  // intent; everything past Interests progressively diverges -- see
  // STEP_FLOWS above. Falls back to Something Real's flow defensively
  // (should never actually happen -- form.intent is always one of the
  // three INTENTS values).
  const steps: StepKey[] = stepsForIntent(form.intent);
  const stepKey: StepKey = steps[step] ?? steps[steps.length - 1] ?? 'ready';
  const hasStep = (key: StepKey) => steps.includes(key);

  // Interests/Tribe/Vybe Check pick-lists are intent-scoped server-side
  // (see lib/constants.ts) -- an empty `intents` tag means "show for
  // every intent."
  const visibleInterests = interests.filter((i) => i.intents.length === 0 || i.intents.includes(form.intent));
  const visibleTribes = tribes.filter((t) => t.intents.length === 0 || t.intents.includes(form.intent));
  const visiblePrompts = prompts.filter((p) => p.intents.length === 0 || p.intents.includes(form.intent));

  // "What are you into?" (interests): a broad, casual read -- 3 to 5 short
  // tags, no drill-down. Deliberately shallower than Tribe below, which is
  // the "actually tell us your specific scene" layer (Something Real /
  // Rishta Ready only). Capped at 3-5 app-wide (see docs/PHONE_FIRST_AUTH.md's
  // sibling onboarding-copy conventions) so no onboarding step ever asks for
  // a minimum above 3 or a maximum above 5 -- this was the one outlier.
  const interestsIncomplete = form.interestIds.length < 3;

  // Tribe: pick up to 5 (4 for Rishta Ready) sub-cultures, then drill into
  // 1-3 specific communities per tribe you picked. Deselecting a tribe
  // drops any sub-communities under it. Never shown for Just Vibing.
  // Both Something Real and Rishta Ready cap tribes at 4, not 5 — a
  // deliberate reduction (see lib/constants.ts) to keep tribe + sub-
  // community selection from ballooning into 30+ decisions.
  const tribeMax = 4;
  function toggleTribe(tribeId: string) {
    setForm((f) => {
      const exists = f.tribeIds.includes(tribeId);
      if (exists) {
        return {
          ...f,
          tribeIds: f.tribeIds.filter((id) => id !== tribeId),
          subCommunityIds: f.subCommunityIds.filter(
            (id) => subCommunities.find((s) => s.id === id)?.tribeId !== tribeId
          ),
        };
      }
      if (f.tribeIds.length >= tribeMax) return f;
      return { ...f, tribeIds: [...f.tribeIds, tribeId] };
    });
  }
  function toggleSubCommunity(subId: string, tribeId: string) {
    setForm((f) => {
      if (f.subCommunityIds.includes(subId)) {
        return { ...f, subCommunityIds: f.subCommunityIds.filter((id) => id !== subId) };
      }
      const pickedForTribe = f.subCommunityIds.filter(
        (id) => subCommunities.find((s) => s.id === id)?.tribeId === tribeId
      ).length;
      if (pickedForTribe >= 3) return f;
      return { ...f, subCommunityIds: [...f.subCommunityIds, subId] };
    });
  }
  const tribeStepIncomplete =
    form.tribeIds.length === 0 ||
    form.tribeIds.some(
      (tribeId) => !form.subCommunityIds.some((id) => subCommunities.find((s) => s.id === id)?.tribeId === tribeId)
    );

  // "Your relationship vibe" -- Something Real only, the values layer,
  // separate from Tribe (what you're into) and Intent (what you're
  // looking for overall). Exactly 3, not "up to 3" -- forces an actual
  // choice instead of everyone picking every flattering-sounding option.
  const relationshipIncomplete = form.relationshipStyleIds.length !== 3;

  // "What's your kind of date?" -- Just Vibing only, replaces Tribe (too
  // deep a layer for a casual flow). Pick exactly 3.
  function toggleDateVibe(slug: string) {
    setForm((f) => ({ ...f, dateVibeTags: toggle(f.dateVibeTags, slug, 3) }));
  }
  const dateVibeIncomplete = form.dateVibeTags.length !== 3;

  // "What are you looking for tonight?" -- Just Vibing only, up to 2, no
  // minimum -- distinguishes casual dating from hookup-oriented
  // expectations without being explicit about it.
  function toggleTonight(slug: string) {
    setForm((f) => ({ ...f, tonightTags: toggle(f.tonightTags, slug, 2) }));
  }

  // "What matters most?" -- Rishta Ready only, replaces the Something
  // Real relationship-vibe step. Pick exactly 4.
  function toggleValue(slug: string) {
    setForm((f) => ({ ...f, valuesTags: toggle(f.valuesTags, slug, 4) }));
  }
  const valuesIncomplete = form.valuesTags.length !== 4;

  // "Your future vibe" -- Rishta Ready only, 4 forced binary picks plus a
  // deliberately 3-way (not binary) Children question -- "want" / "don't
  // want" alone can't capture someone who's unsure.
  const futureIncomplete =
    !form.futureHome || !form.futureFamily || !form.futureCareer || !form.futureMoney || !form.children;

  // Vybe Check: pick 2 prompts (2-3 for Rishta Ready) and pick a side on
  // each -- a forced choice between two fixed options, never a typed
  // answer. Interests exist on every dating app -- this is findmyVybe's
  // own thing, and its tone (playful / relationship-facing /
  // future-facing) shifts hard by intent, so the prompt pool itself is
  // intent-scoped (see visiblePrompts above). The swipe card
  // (components/VibeCard.tsx) already blurs a profile behind these
  // answers and reveals them one tap at a time ("no guessing games" is
  // the whole pitch).
  // Switching intent mid-onboarding (via the Intent step, or later from the
  // Profile page) must wipe every intent-specific selection -- otherwise a
  // stale tribe/prompt/values pick from the old intent silently carries
  // over: it can count against the new intent's pick caps (blocking new
  // choices) and/or render as pre-checked even though the person never
  // chose it under this intent. Basics/photos/interests are intent-agnostic
  // and are kept.
  function selectIntent(nextIntent: string) {
    setForm((f) => ({
      ...f,
      intent: nextIntent,
      tribeIds: [],
      subCommunityIds: [],
      relationshipStyleIds: [],
      promptAnswers: [],
      dateVibeTags: [],
      tonightTags: [],
      livingPreference: '',
      valuesTags: [],
      futureHome: '',
      futureFamily: '',
      futureCareer: '',
      futureMoney: '',
      children: '',
    }));
    setStep(0);
  }

  const vybeMax = form.intent === 'RISHTA_READY' ? 3 : 2;
  function togglePrompt(promptId: string) {
    setForm((f) => {
      const exists = f.promptAnswers.some((pa) => pa.promptId === promptId);
      if (exists) return { ...f, promptAnswers: f.promptAnswers.filter((pa) => pa.promptId !== promptId) };
      const max = f.intent === 'RISHTA_READY' ? 3 : 2;
      if (f.promptAnswers.length >= max) return f;
      return { ...f, promptAnswers: [...f.promptAnswers, { promptId, answer: '' }] };
    });
  }
  function selectPromptOption(promptId: string, answer: string) {
    setForm((f) => ({
      ...f,
      promptAnswers: f.promptAnswers.map((pa) => (pa.promptId === promptId ? { ...pa, answer } : pa)),
    }));
  }
  const vybeCheckIncomplete =
    form.promptAnswers.length < 2 || form.promptAnswers.some((pa) => !pa.answer.trim());

  // Photos: uploaded one at a time as they're picked (not deferred to
  // "Finish") so someone sees the real upload result -- and a real error --
  // immediately, rather than discovering a bad file only at the very last
  // step. No Profile row exists yet at this point in onboarding, so
  // app/api/upload/route.ts just stores the file and hands back a URL;
  // these URLs become real Photo rows once app/api/profile/route.ts saves
  // the rest of the form.
  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!file) return;
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      // Check client-side, before ever sending the file: Vercel's
      // platform itself hard-rejects an oversized request body (a 413,
      // plain text not JSON) before our route handler gets a chance to
      // return its own friendly "Image must be under 4MB" error -- see
      // lib/imageValidation.ts's doc comment.
      assertValidImage(file);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed');
      return;
    }
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, data.url].slice(0, 5) }));
      // /api/upload no longer moderates at all (that happens once,
      // asynchronously, when /api/profile's PUT below actually creates
      // the Photo rows) -- so there's normally no notice at this step;
      // this just stays defensive in case that ever changes.
      if (data.notice) setPhotoNotice(data.notice);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }
  function removePhoto(index: number) {
    setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((_, i) => i !== index) }));
  }

  // Family Preview: a curated, read-only summary (name, age, city, intent --
  // no bio, no Vybe Check answers, nothing from the swipe deck) that's
  // shareable outside the app. It's the one piece of the matrimony
  // side of "dating/matrimony hybrid" that no swipe app has and no
  // matrimony site makes optional -- off by default, and only offered to
  // people who picked Rishta Ready.
  const previewUrl = myUserId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/preview/${myUserId}` : null;

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      // Rishta Ready's single-select fields default to '' in local state
      // for the other two intents -- send them as undefined (dropped by
      // JSON.stringify) rather than an empty string, since the server's
      // zod schema validates each as one of a fixed set of real slugs.
      const payload = {
        ...form,
        livingPreference: form.livingPreference || undefined,
        futureHome: form.futureHome || undefined,
        futureFamily: form.futureFamily || undefined,
        futureCareer: form.futureCareer || undefined,
        futureMoney: form.futureMoney || undefined,
        children: form.children || undefined,
      };
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save profile');
      if (data.notice) {
        // "We're verifying your photos" -- moderation now runs
        // asynchronously (see docs/IDENTITY_VERIFICATION_AND_SAFETY.md
        // S11), so this submit can no longer fail with "all your photos
        // were rejected"; give them a moment to actually read the notice
        // before navigating away from it.
        setFinishNotice(data.notice);
        setTimeout(() => router.push(editMode ? '/profile' : '/discover'), 3500);
      } else {
        router.push(editMode ? '/profile' : '/discover');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  const nextDisabled =
    (stepKey === 'basics' &&
      (!form.displayName ||
        !form.dateOfBirth ||
        dobTooYoung ||
        // Email is mandatory for a brand-new signup's first pass through
        // Basics (phone-first signup, email right after -- see
        // docs/PHONE_FIRST_AUTH.md), but not retroactively required of an
        // existing account revisiting Basics via switchIntent.
        (!editMode && !verifiedEmail) ||
        (form.intent === 'RISHTA_READY' && !form.livingPreference))) ||
    (stepKey === 'photos' && form.photoUrls.length === 0) ||
    (stepKey === 'interests' && interestsIncomplete) ||
    (stepKey === 'tribe' && tribeStepIncomplete) ||
    (stepKey === 'relationship' && relationshipIncomplete) ||
    (stepKey === 'datevibe' && dateVibeIncomplete) ||
    (stepKey === 'values' && valuesIncomplete) ||
    (stepKey === 'future' && futureIncomplete) ||
    (stepKey === 'vybecheck' && vybeCheckIncomplete);

  // Belt-and-suspenders check on the final "ready" screen's Finish button
  // -- each Next click already gated its own step, but re-checking every
  // step this flow actually has means a stray path (e.g. hitting Back and
  // switching intent) can never reach a broken submit.
  const flowIncomplete =
    saving ||
    form.photoUrls.length === 0 ||
    interestsIncomplete ||
    (hasStep('tribe') && tribeStepIncomplete) ||
    (hasStep('relationship') && relationshipIncomplete) ||
    (hasStep('datevibe') && dateVibeIncomplete) ||
    (hasStep('values') && valuesIncomplete) ||
    (hasStep('future') && futureIncomplete) ||
    vybeCheckIncomplete ||
    (form.intent === 'RISHTA_READY' && !form.livingPreference);

  return (
    <>
      <InactivityLogout />
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-6 py-3 backdrop-blur">
        <Link href="/discover" className="font-display text-lg font-extrabold">
          findmy<span className="text-magenta">Vybe</span>
        </Link>
      </header>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-marigold">
          Step {step + 1} of {steps.length} — {STEP_LABELS[stepKey]}
        </p>
        <div className="mt-2 flex gap-1.5">
          {steps.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-magenta' : 'bg-line'}`} />
          ))}
        </div>
      </div>

      {editMode && (
        <p className="-mt-2 rounded-xl bg-marigold/10 px-3 py-2 text-xs font-semibold text-inkSoft">
          Switching to {INTENTS.find((i) => i.value === form.intent)?.label ?? 'your new vibe'} — just confirm a few things below.
        </p>
      )}

      {stepKey === 'intent' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">What are you here for?</h1>
          <p className="text-sm text-inkSoft">Pick your lane — we&apos;ll only show you people on the same page.</p>
          {INTENTS.map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => selectIntent(i.value)}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left ${
                form.intent === i.value ? 'border-magenta bg-magenta/5' : 'border-line'
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {i.emoji}
              </span>
              <span className="flex-1">
                <span className="block font-bold">{i.label}</span>
                <span className="block text-sm text-inkSoft">{i.blurb}</span>
              </span>
              {form.intent === i.value && (
                <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-magenta text-xs text-white">
                  ✓
                </span>
              )}
            </button>
          ))}
          <p className="text-xs text-inkSoft">Your vibe can change. Switch your intent anytime.</p>
        </div>
      )}

      {stepKey === 'basics' && (
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">First, the basics</h1>
          <input
            placeholder="What should we call you?"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="rounded-2xl border border-line px-4 py-3"
          />
          <div className="flex flex-col gap-1">
            <input
              type="date"
              value={form.dateOfBirth}
              max={maxDob}
              min={minDob}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              className="rounded-2xl border border-line px-4 py-3"
            />
            {dobTooYoung && (
              <p className="text-xs font-medium text-magenta">You must be 18 or older to use findmyVybe.</p>
            )}
          </div>
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
            className="rounded-2xl border border-line px-4 py-3"
          >
            <option value="WOMAN">Woman</option>
            <option value="MAN">Man</option>
            <option value="NON_BINARY">Non-binary</option>
            <option value="OTHER">Other</option>
          </select>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Show me:</p>
            <div className="flex gap-2">
              {['WOMAN', 'MAN', 'NON_BINARY', 'OTHER'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm({ ...form, lookingFor: toggle(form.lookingFor, g, 4) })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    form.lookingFor.includes(g) ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  }`}
                >
                  {g === 'WOMAN' ? 'Women' : g === 'MAN' ? 'Men' : g === 'NON_BINARY' ? 'Non-binary' : 'Everyone'}
                </button>
              ))}
            </div>
          </div>
          <select
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="rounded-2xl border border-line px-4 py-3"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            placeholder="A one-line bio (optional)"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            maxLength={280}
            className="rounded-2xl border border-line px-4 py-3"
            rows={2}
          />
          {/* Mandatory for a fresh signup only -- see nextDisabled above.
              Phone already got them this far; this is what makes most
              future sign-ins skip SMS entirely (lib/otp.ts's request-otp
              route sends the code here instead, once this is verified). */}
          {!editMode && (
            <div className="rounded-2xl border border-line bg-white p-3">
              <p className="text-sm font-bold">Email address</p>
              <p className="mb-2 text-xs text-inkSoft">
                So we can reach you if your phone&apos;s ever unreachable -- and so future sign-ins on a new
                device usually won&apos;t need an SMS code at all.
              </p>
              {verifiedEmail ? (
                <p className="text-sm font-semibold text-green-700">✓ {verifiedEmail}</p>
              ) : (
                <EmailVerifyField onVerified={(email) => setVerifiedEmail(email)} />
              )}
            </div>
          )}
          {form.intent === 'RISHTA_READY' && (
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
              <p className="text-sm font-semibold">Where do you see yourself living?</p>
              <div className="flex flex-wrap gap-2">
                {LIVING_PREFERENCES.map((l) => (
                  <button
                    key={l.slug}
                    type="button"
                    onClick={() => setForm({ ...form, livingPreference: l.slug })}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      form.livingPreference === l.slug ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                    }`}
                  >
                    {l.emoji} {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stepKey === 'photos' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Add your photos</h1>
          <p className="text-sm text-inkSoft">Your first photo is your first impression.</p>
          <div className="grid grid-cols-3 gap-2">
            {form.photoUrls.map((url, i) => (
              <div key={url + i} className="relative aspect-square overflow-hidden rounded-2xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- external/Blob URLs, no next/image domain config needed */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Primary
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs text-white"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
            {form.photoUrls.length < 5 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-xs font-semibold text-inkSoft">
                {uploadingPhoto ? 'Uploading...' : '+ Add'}
                <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" className="hidden" disabled={uploadingPhoto} onChange={addPhoto} />
              </label>
            )}
          </div>
          {photoError && <p className="text-xs text-magenta">{photoError}</p>}
          {photoNotice && <p className="text-xs text-inkSoft">{photoNotice}</p>}
        </div>
      )}

      {stepKey === 'interests' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">✨ What are you into?</h1>
          <p className="text-sm text-inkSoft">Pick 3 to 5 — the quick, casual read on you.</p>
          <div className="flex flex-wrap gap-2">
            {visibleInterests.map((i) => {
              const selected = form.interestIds.includes(i.id);
              const disabled = !selected && form.interestIds.length >= 5;
              return (
                <button
                  key={i.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setForm({ ...form, interestIds: toggle(form.interestIds, i.id, 5) })}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {i.emoji} {i.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-inkSoft">
            {form.interestIds.length} of 5 picked{interestsIncomplete ? ' — need at least 3' : ''}
          </p>
        </div>
      )}

      {stepKey === 'tribe' && (
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">What&apos;s your tribe?</h1>
          <p className="text-sm text-inkSoft">
            Pick up to {tribeMax}, then tell us your specific corner of each one — this is the deep-cut layer
            under &quot;interests,&quot; the one that finds someone who games on your platform, not just someone
            who &quot;likes gaming.&quot;
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleTribes.map((t) => {
              const selected = form.tribeIds.includes(t.id);
              const disabled = !selected && form.tribeIds.length >= tribeMax;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleTribe(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>

          {form.tribeIds.map((tribeId) => {
            const tribe = tribes.find((t) => t.id === tribeId);
            if (!tribe) return null;
            const subsForTribe = subCommunities.filter((s) => s.tribeId === tribeId);
            const pickedForTribe = form.subCommunityIds.filter((id) => subsForTribe.some((s) => s.id === id)).length;
            return (
              <div key={tribeId} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
                <p className="text-sm font-semibold">
                  {tribe.emoji} {tribe.label} — pick 1 to 3
                </p>
                <div className="flex flex-wrap gap-2">
                  {subsForTribe.map((s) => {
                    const selected = form.subCommunityIds.includes(s.id);
                    const disabled = !selected && pickedForTribe >= 3;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSubCommunity(s.id, tribeId)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          selected ? 'border-mint bg-mint/10 text-mint' : 'border-line'
                        } ${disabled ? 'opacity-40' : ''}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stepKey === 'relationship' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">❤️ Your relationship vibe</h1>
          <p className="text-sm text-inkSoft">
            Pick exactly 3 — this is the values layer, separate from what you&apos;re into.
          </p>
          <div className="flex flex-wrap gap-2">
            {relationshipStyles.map((r) => {
              const selected = form.relationshipStyleIds.includes(r.id);
              const disabled = !selected && form.relationshipStyleIds.length >= 3;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setForm({ ...form, relationshipStyleIds: toggle(form.relationshipStyleIds, r.id, 3) })}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {r.emoji} {r.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-inkSoft">{form.relationshipStyleIds.length} of 3 picked</p>
        </div>
      )}

      {stepKey === 'datevibe' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Your vibe</h1>
          <p className="text-sm text-inkSoft">What&apos;s your kind of date? Pick exactly 3.</p>
          <div className="flex flex-wrap gap-2">
            {DATE_VIBES.map((d) => {
              const selected = form.dateVibeTags.includes(d.slug);
              const disabled = !selected && form.dateVibeTags.length >= 3;
              return (
                <button
                  key={d.slug}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDateVibe(d.slug)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {d.emoji} {d.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-inkSoft">{form.dateVibeTags.length} of 3 picked</p>
        </div>
      )}

      {stepKey === 'tonight' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">What are you looking for tonight?</h1>
          <p className="text-sm text-inkSoft">Pick up to 2 — totally optional.</p>
          <div className="flex flex-wrap gap-2">
            {TONIGHT_OPTIONS.map((t) => {
              const selected = form.tonightTags.includes(t.slug);
              const disabled = !selected && form.tonightTags.length >= 2;
              return (
                <button
                  key={t.slug}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleTonight(t.slug)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stepKey === 'values' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">🧭 What matters most?</h1>
          <p className="text-sm text-inkSoft">Pick exactly 4 — this becomes your values layer.</p>
          <div className="flex flex-wrap gap-2">
            {VALUES_OPTIONS.map((v) => {
              const selected = form.valuesTags.includes(v.slug);
              const disabled = !selected && form.valuesTags.length >= 4;
              return (
                <button
                  key={v.slug}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleValue(v.slug)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {v.emoji} {v.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-inkSoft">{form.valuesTags.length} of 4 picked</p>
        </div>
      )}

      {stepKey === 'future' && (
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">Your future vibe</h1>
          <p className="text-sm text-inkSoft">Serious questions, playful UX — pick a side on each.</p>
          {FUTURE_VIBE_QUESTIONS.map((q) => {
            const key = q.key as 'home' | 'family' | 'career' | 'money';
            const value = form[
              key === 'home' ? 'futureHome' : key === 'family' ? 'futureFamily' : key === 'career' ? 'futureCareer' : 'futureMoney'
            ];
            const setValue = (slug: string) =>
              setForm({
                ...form,
                ...(key === 'home'
                  ? { futureHome: slug }
                  : key === 'family'
                    ? { futureFamily: slug }
                    : key === 'career'
                      ? { futureCareer: slug }
                      : { futureMoney: slug }),
              });
            return (
              <div key={q.key} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
                <p className="text-sm font-semibold">{q.question}</p>
                <div className="flex gap-2">
                  {[q.optionA, q.optionB].map((option) => (
                    <button
                      key={option.slug}
                      type="button"
                      onClick={() => setValue(option.slug)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                        value === option.slug ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                      }`}
                    >
                      {option.emoji} {option.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
            <p className="text-sm font-semibold">Children?</p>
            <div className="flex flex-wrap gap-2">
              {CHILDREN_OPTIONS.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setForm({ ...form, children: c.slug })}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    form.children === c.slug ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {stepKey === 'vybecheck' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Vybe Check</h1>
          <p className="text-sm text-inkSoft">
            Pick {vybeMax === 3 ? '2 to 3' : '2'} prompts, then pick a side on each — no typing. On the feed,
            people meet these first — your photo and name stay blurred until they reveal your answers.
            That&apos;s &quot;no guessing games,&quot; for real.
          </p>
          <div className="flex flex-wrap gap-2">
            {visiblePrompts.map((p) => {
              const selected = form.promptAnswers.some((pa) => pa.promptId === p.id);
              const disabled = !selected && form.promptAnswers.length >= vybeMax;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => togglePrompt(p.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {p.emoji} {p.text}
                </button>
              );
            })}
          </div>
          {form.promptAnswers.length > 0 && (
            <div className="flex flex-col gap-3">
              {form.promptAnswers.map((pa) => {
                const prompt = prompts.find((p) => p.id === pa.promptId);
                if (!prompt) return null;
                return (
                  <div key={pa.promptId} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-3">
                    <p className="text-xs font-semibold text-inkSoft">
                      {prompt.emoji} {prompt.text}
                    </p>
                    <div className="flex gap-2">
                      {[prompt.optionA, prompt.optionB].map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => selectPromptOption(pa.promptId, option)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                            pa.answer === option ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {stepKey === 'familypreview' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Family Preview</h1>
          <p className="text-sm text-inkSoft">
            An optional, read-only introduction card you can share outside findmyVybe — with family, say. Far less
            than your real profile: just your name, age, city, and intent. No bio, no Vybe Check answers, nothing
            from the swipe deck. Off by default, and you can turn it off anytime from your profile.
          </p>

          <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
            <div>
              <p className="font-bold">Family preview link</p>
              <p className="text-sm text-inkSoft">Generate a read-only profile preview to share with family.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.familyPreviewOn}
              onClick={() => setForm({ ...form, familyPreviewOn: !form.familyPreviewOn })}
              className={`h-7 w-12 flex-none rounded-full transition ${form.familyPreviewOn ? 'bg-mint' : 'bg-line'}`}
            >
              <span
                className={`block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform ${
                  form.familyPreviewOn ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {form.familyPreviewOn && (
            <>
              <div className="rounded-card border border-line bg-white p-5 text-center shadow">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">Preview</p>
                <h2 className="mt-1 font-display text-xl font-extrabold">
                  {form.displayName || 'Your name'}
                  {age !== null ? `, ${age}` : ''}
                </h2>
                <p className="text-sm text-inkSoft">{form.city}</p>
                <div className="mt-3">
                  <IntentBadge intent={form.intent} />
                </div>
              </div>
              {previewUrl && (
                <p className="break-all rounded-xl border border-line bg-white px-3 py-2 text-xs text-inkSoft">
                  Your link (live once you finish setup): <span className="font-semibold text-ink">{previewUrl}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {stepKey === 'ready' && (
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">⚡ Your Vybe is Ready</h1>
          <p className="text-sm text-inkSoft">Here&apos;s what we&apos;ve got — you can always change this later from your profile.</p>
          <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-extrabold">
                {form.displayName || 'You'}
                {age !== null ? `, ${age}` : ''}
              </p>
              <IntentBadge intent={form.intent} />
            </div>
            <p className="text-sm text-inkSoft">{form.city}</p>
            {form.interestIds.length > 0 && (
              <p className="text-sm">
                {interests
                  .filter((i) => form.interestIds.includes(i.id))
                  .map((i) => `${i.emoji} ${i.label}`)
                  .join(' · ')}
              </p>
            )}
            {form.intent === 'JUST_VIBING' && form.dateVibeTags.length > 0 && (
              <p className="text-sm text-inkSoft">
                {DATE_VIBES.filter((d) => form.dateVibeTags.includes(d.slug))
                  .map((d) => `${d.emoji} ${d.label}`)
                  .join(' · ')}
              </p>
            )}
            {form.intent === 'SOMETHING_REAL' && form.relationshipStyleIds.length > 0 && (
              <p className="text-sm text-inkSoft">
                {relationshipStyles
                  .filter((r) => form.relationshipStyleIds.includes(r.id))
                  .map((r) => `${r.emoji} ${r.label}`)
                  .join(' · ')}
              </p>
            )}
            {form.intent === 'RISHTA_READY' && form.valuesTags.length > 0 && (
              <p className="text-sm text-inkSoft">
                {VALUES_OPTIONS.filter((v) => form.valuesTags.includes(v.slug))
                  .map((v) => `${v.emoji} ${v.label}`)
                  .join(' · ')}
              </p>
            )}
          </div>
          <p className="text-xs text-inkSoft">Tap &quot;Let&apos;s go&quot; below to head to your feed.</p>
        </div>
      )}

      {error && <p className="text-sm text-magenta">{error}</p>}
      {finishNotice && <p className="text-sm text-inkSoft">{finishNotice}</p>}

      {/* Sticky rather than a plain in-flow row: several steps (interests,
          tribe, values, prompts) run well past one screen's height, and a
          Next button that only appears after scrolling all the way down is
          easy to miss entirely on first glance -- pinning it to the bottom
          of the viewport means it's always reachable with zero scrolling,
          on both mobile and desktop web. -mx-6/px-6 cancels then reinstates
          <main>'s own horizontal padding so the bar's background spans the
          full width of the centered column instead of floating with gaps
          on either side; the safe-area padding keeps it clear of the home
          indicator on iOS (this ships inside the Capacitor app too). */}
      <div className="sticky bottom-0 z-10 -mx-6 mt-auto flex justify-between border-t border-line bg-white/95 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        <button
          type="button"
          disabled={step === minStep}
          onClick={() => setStep((s) => Math.max(minStep, s - 1))}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-inkSoft disabled:opacity-0"
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={nextDisabled}
            className="gradient-btn rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={flowIncomplete}
            className="gradient-btn rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : "Let's go →"}
          </button>
        )}
      </div>
    </main>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}

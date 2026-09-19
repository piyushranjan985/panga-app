'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import IntentBadge from '@/components/IntentBadge';
import {
  DATE_VIBES,
  TONIGHT_OPTIONS,
  VALUES_OPTIONS,
  LIVING_PREFERENCES,
  FUTURE_VIBE_QUESTIONS,
  CHILDREN_OPTIONS,
} from '@/lib/constants';

interface Photo {
  id: string;
  url: string;
  position: number;
}

interface ProfileData {
  userId: string;
  displayName: string;
  city: string;
  bio: string;
  intent: string;
  quietMode: boolean;
  familyPreviewOn: boolean;
  verification: string;
  avatarSeed: string;
  photos: Photo[];
  interests: { id: string; label: string; emoji: string }[];
  tribes: { id: string; label: string; emoji: string; personaLabel: string }[];
  relationshipStyles: { id: string; label: string; emoji: string }[];
  // Intent-specific fields (see the per-intent steps in app/onboarding/page.tsx)
  // -- each is only ever populated for the intent that actually collects it,
  // so the sections below only render the ones relevant to profile.intent.
  dateVibeTags: string[];
  tonightTags: string[];
  livingPreference: string | null;
  valuesTags: string[];
  futureHome: string | null;
  futureFamily: string | null;
  futureCareer: string | null;
  futureMoney: string | null;
  children: string | null;
}

const INTENTS = ['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY'] as const;
const INTENT_EMOJI: Record<string, string> = {
  JUST_VIBING: '💫',
  SOMETHING_REAL: '❤️',
  RISHTA_READY: '💍',
};
const INTENT_LABEL: Record<string, string> = {
  JUST_VIBING: 'Just Vibing',
  SOMETHING_REAL: 'Something Real',
  RISHTA_READY: 'Rishta Ready',
};
const MAX_PHOTOS = 5;

// slug -> {label, emoji} lookups for the intent-specific tag fields, which
// store plain slugs on Profile (see prisma/schema.prisma), not relations --
// same pick-lists app/onboarding/page.tsx uses to render them.
function bySlug(options: { slug: string; label: string; emoji: string }[]) {
  return new Map(options.map((o) => [o.slug, o]));
}
const DATE_VIBE_BY_SLUG = bySlug(DATE_VIBES);
const TONIGHT_BY_SLUG = bySlug(TONIGHT_OPTIONS);
const VALUES_BY_SLUG = bySlug(VALUES_OPTIONS);
const LIVING_PREFERENCE_BY_SLUG = bySlug(LIVING_PREFERENCES);
const CHILDREN_BY_SLUG = bySlug(CHILDREN_OPTIONS);

function futureVibeAnswer(key: 'home' | 'family' | 'career' | 'money', slug: string | null) {
  if (!slug) return null;
  const q = FUTURE_VIBE_QUESTIONS.find((question) => question.key === key);
  if (!q) return null;
  const option = q.optionA.slug === slug ? q.optionA : q.optionB.slug === slug ? q.optionB : null;
  return option ? { question: q.question, option } : null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function load() {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => setProfile(d.profile));
  }

  useEffect(load, []);

  async function patch(update: Partial<Pick<ProfileData, 'quietMode' | 'familyPreviewOn'>>) {
    setProfile((p) => (p ? { ...p, ...update } : p));
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }

  async function requestVerification() {
    setVerifying(true);
    await fetch('/api/verification', { method: 'POST' });
    setProfile((p) => (p ? { ...p, verification: 'PENDING' } : p));
    setTimeout(() => {
      load();
      setVerifying(false);
    }, 4500);
  }

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!file) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/profile/photos', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setProfile((p) => (p ? { ...p, photos: [...p.photos, data.photo] } : p));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(photoId: string) {
    setPhotoError(null);
    setDeletingPhotoId(photoId);
    try {
      const res = await fetch(`/api/profile/photos/${photoId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not remove photo');
      setProfile((p) => (p ? { ...p, photos: p.photos.filter((ph) => ph.id !== photoId) } : p));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove photo');
    } finally {
      setDeletingPhotoId(null);
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen pb-24 sm:pb-10">
        <Navbar />
        <p className="px-4 py-6 text-sm text-inkSoft">Loading...</p>
      </div>
    );
  }

  const primaryPhoto = profile.photos[0]?.url;
  const futureVibeAnswers = [
    futureVibeAnswer('home', profile.futureHome),
    futureVibeAnswer('family', profile.futureFamily),
    futureVibeAnswer('career', profile.futureCareer),
    futureVibeAnswer('money', profile.futureMoney),
  ].filter((a): a is { question: string; option: { slug: string; label: string; emoji: string } } => Boolean(a));
  const livingPreference = profile.livingPreference ? LIVING_PREFERENCE_BY_SLUG.get(profile.livingPreference) : null;
  const childrenPreference = profile.children ? CHILDREN_BY_SLUG.get(profile.children) : null;

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center gap-4">
          {primaryPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/Blob URLs
            <img src={primaryPhoto} alt="" className="h-16 w-16 rounded-full border border-line object-cover" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-marigold to-magenta font-display text-2xl font-bold text-white">
              {profile.avatarSeed}
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-extrabold">{profile.displayName}</h1>
            <p className="text-sm text-inkSoft">{profile.city}</p>
          </div>
        </div>

        {profile.bio && <p className="mt-4 text-sm text-inkSoft">{profile.bio}</p>}

        <section className="mt-8">
          <h2 className="mb-2 font-display text-lg font-bold">Photos</h2>
          <p className="mb-2 text-xs text-inkSoft">Your first photo is your first impression.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {profile.photos.map((photo, i) => (
              <div key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- external/Blob URLs */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Primary
                  </span>
                )}
                {profile.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    disabled={deletingPhotoId === photo.id}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs text-white disabled:opacity-60"
                    aria-label="Remove photo"
                  >
                    {deletingPhotoId === photo.id ? '…' : '✕'}
                  </button>
                )}
              </div>
            ))}
            {profile.photos.length < MAX_PHOTOS && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-xs font-semibold text-inkSoft">
                {uploadingPhoto ? 'Uploading...' : '+ Add'}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={addPhoto} />
              </label>
            )}
          </div>
          {photoError && <p className="mt-2 text-xs text-magenta">{photoError}</p>}
        </section>

        <section className="mt-8">
          <h2 className="mb-2 font-display text-lg font-bold">Intent</h2>
          <p className="mb-3 text-xs text-inkSoft">Your vibe can change. Switch your intent anytime.</p>
          {/* The current intent gets its own large, unmistakable card instead
              of just being one row among three -- "immediately understandable"
              means not having to compare opacity/borders across three equal
              options to figure out which one is active. */}
          <div className="flex items-center gap-3 rounded-2xl border-2 border-magenta bg-magenta/5 px-4 py-4">
            <span className="text-3xl leading-none" aria-hidden>
              {INTENT_EMOJI[profile.intent]}
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-magenta">Currently</p>
              <p className="font-display text-xl font-extrabold">{INTENT_LABEL[profile.intent] ?? profile.intent}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {INTENTS.filter((i) => i !== profile.intent).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => router.push(`/onboarding?switchIntent=${i}`)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:border-inkSoft/40"
              >
                <IntentBadge intent={i} />
                <span className="text-xs font-semibold text-inkSoft">Switch →</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-white p-4">
          <div>
            <p className="font-bold">Quiet Mode</p>
            <p className="text-sm text-inkSoft">Pause discovery without deleting your profile.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={profile.quietMode}
            onClick={() => patch({ quietMode: !profile.quietMode })}
            className={`h-7 w-12 flex-none rounded-full transition ${profile.quietMode ? 'bg-mint' : 'bg-line'}`}
          >
            <span
              className={`block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform ${
                profile.quietMode ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </section>

        {profile.intent === 'RISHTA_READY' && (
          <section className="mt-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">Family preview link</p>
                <p className="text-sm text-inkSoft">Generate a read-only profile preview to share with family.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profile.familyPreviewOn}
                onClick={() => patch({ familyPreviewOn: !profile.familyPreviewOn })}
                className={`h-7 w-12 flex-none rounded-full transition ${profile.familyPreviewOn ? 'bg-mint' : 'bg-line'}`}
              >
                <span
                  className={`block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform ${
                    profile.familyPreviewOn ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
            {profile.familyPreviewOn && (
              <p className="mt-3 break-all rounded-xl border border-line bg-paper px-3 py-2 text-xs text-inkSoft">
                {typeof window !== 'undefined' ? `${window.location.origin}/preview/${profile.userId}` : `/preview/${profile.userId}`}
              </p>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">Trust layer</p>
              <p className="text-sm text-inkSoft">
                {profile.verification === 'VERIFIED' && 'ID + liveness verified ✅'}
                {profile.verification === 'PENDING' && 'Verification in progress…'}
                {profile.verification === 'UNVERIFIED' && 'Not verified yet'}
                {profile.verification === 'REJECTED' && 'Verification failed — try again'}
              </p>
            </div>
            {profile.verification !== 'VERIFIED' && (
              <button
                type="button"
                onClick={requestVerification}
                disabled={verifying || profile.verification === 'PENDING'}
                className="gradient-btn rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {verifying || profile.verification === 'PENDING' ? 'Verifying…' : 'Get verified'}
              </button>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 font-display text-lg font-bold">What I&apos;m into</h2>
          <div className="flex flex-wrap gap-2">
            {profile.interests.map((i) => (
              <span key={i.id} className="rounded-full border border-line px-3 py-1 text-sm">
                {i.emoji} {i.label}
              </span>
            ))}
          </div>
        </section>

        {/* Everything below is intent-specific -- see the per-intent steps in
            app/onboarding/page.tsx. Just Vibing never collects Tribe/
            Relationship data; Rishta Ready swaps Relationship for Values/
            Future Vibe/Children -- so this profile only ever shows the
            sections that match the intent someone is currently on. */}

        {profile.intent === 'JUST_VIBING' && (
          <>
            {profile.dateVibeTags.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 font-display text-lg font-bold">My kind of date</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.dateVibeTags.map((slug) => {
                    const option = DATE_VIBE_BY_SLUG.get(slug);
                    return (
                      <span key={slug} className="rounded-full border border-line px-3 py-1 text-sm">
                        {option?.emoji} {option?.label ?? slug}
                      </span>
                    );
                  })}
                </div>
              </section>
            )}
            {profile.tonightTags.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 font-display text-lg font-bold">Looking for tonight</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.tonightTags.map((slug) => {
                    const option = TONIGHT_BY_SLUG.get(slug);
                    return (
                      <span key={slug} className="rounded-full border border-line px-3 py-1 text-sm">
                        {option?.emoji} {option?.label ?? slug}
                      </span>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {(profile.intent === 'SOMETHING_REAL' || profile.intent === 'RISHTA_READY') && profile.tribes.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-lg font-bold">Your tribes</h2>
            <div className="flex flex-wrap gap-2">
              {profile.tribes.map((t) => (
                <span key={t.id} className="rounded-full border border-line px-3 py-1 text-sm">
                  {t.emoji} {t.personaLabel || t.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {profile.intent === 'SOMETHING_REAL' && profile.relationshipStyles.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-lg font-bold">My ideal relationship is&hellip;</h2>
            <div className="flex flex-wrap gap-2">
              {profile.relationshipStyles.map((r) => (
                <span key={r.id} className="rounded-full border border-line px-3 py-1 text-sm">
                  {r.emoji} {r.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {profile.intent === 'RISHTA_READY' && (
          <>
            {profile.valuesTags.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 font-display text-lg font-bold">What matters most</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.valuesTags.map((slug) => {
                    const option = VALUES_BY_SLUG.get(slug);
                    return (
                      <span key={slug} className="rounded-full border border-line px-3 py-1 text-sm">
                        {option?.emoji} {option?.label ?? slug}
                      </span>
                    );
                  })}
                </div>
              </section>
            )}
            {livingPreference && (
              <section className="mt-6">
                <h2 className="mb-2 font-display text-lg font-bold">Where I see myself living</h2>
                <span className="rounded-full border border-line px-3 py-1 text-sm">
                  {livingPreference.emoji} {livingPreference.label}
                </span>
              </section>
            )}
            {futureVibeAnswers.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 font-display text-lg font-bold">Future vibe</h2>
                <div className="flex flex-col gap-2">
                  {futureVibeAnswers.map(({ question, option }) => (
                    <div key={question} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                      <span className="text-inkSoft">{question}</span>
                      <span className="font-semibold">
                        {option.emoji} {option.label}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {childrenPreference && (
              <section className="mt-6">
                <h2 className="mb-2 font-display text-lg font-bold">On children</h2>
                <span className="rounded-full border border-line px-3 py-1 text-sm">
                  {childrenPreference.emoji} {childrenPreference.label}
                </span>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

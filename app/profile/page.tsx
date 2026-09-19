'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import IntentBadge from '@/components/IntentBadge';

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
  circles: { circle: { id: string; name: string } }[];
}

const INTENTS = ['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY'];
const MAX_PHOTOS = 5;

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

  async function patch(update: Partial<Pick<ProfileData, 'intent' | 'quietMode' | 'familyPreviewOn'>>) {
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
          <p className="mb-2 text-xs text-inkSoft">1 to {MAX_PHOTOS} — the first one is what people see first on the feed.</p>
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
          <p className="mb-3 text-xs text-inkSoft">
            Switching updates what people see and asks you a couple of quick questions for the new vibe.
          </p>
          {/* Previously three bare badges distinguished only by opacity -- easy
              to miss as a control at all, not just hard to tell which one was
              "on." Full-width bordered rows plus an explicit Current/Switch
              label on each make it unmistakably a set of tappable options. */}
          <div className="flex flex-col gap-2">
            {INTENTS.map((i) => {
              const isCurrent = profile.intent === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (isCurrent) return;
                    router.push(`/onboarding?switchIntent=${i}`);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    isCurrent ? 'border-magenta bg-magenta/5' : 'border-line hover:border-inkSoft/40'
                  }`}
                >
                  <IntentBadge intent={i} />
                  {isCurrent ? (
                    <span className="text-xs font-semibold text-magenta">Current</span>
                  ) : (
                    <span className="text-xs font-semibold text-inkSoft">Switch →</span>
                  )}
                </button>
              );
            })}
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

        {profile.tribes.length > 0 && (
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

        {profile.relationshipStyles.length > 0 && (
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

        <section className="mt-6">
          <h2 className="mb-2 font-display text-lg font-bold">Circles</h2>
          <div className="flex flex-wrap gap-2">
            {profile.circles.map((c) => (
              <span key={c.circle.id} className="rounded-full border border-line px-3 py-1 text-sm">
                {c.circle.name}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

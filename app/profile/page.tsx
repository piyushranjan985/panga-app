'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import IntentBadge from '@/components/IntentBadge';

interface ProfileData {
  displayName: string;
  city: string;
  bio: string;
  intent: string;
  quietMode: boolean;
  familyPreviewOn: boolean;
  verification: string;
  avatarSeed: string;
  interests: { id: string; label: string; emoji: string }[];
  circles: { circle: { id: string; name: string } }[];
}

const INTENTS = ['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY'];

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [verifying, setVerifying] = useState(false);

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

  if (!profile) {
    return (
      <div className="min-h-screen pb-24 sm:pb-10">
        <Navbar />
        <p className="px-4 py-6 text-sm text-inkSoft">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-marigold to-magenta font-display text-2xl font-bold text-white">
            {profile.avatarSeed}
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold">{profile.displayName}</h1>
            <p className="text-sm text-inkSoft">{profile.city}</p>
          </div>
        </div>

        {profile.bio && <p className="mt-4 text-sm text-inkSoft">{profile.bio}</p>}

        <section className="mt-8">
          <h2 className="mb-2 font-display text-lg font-bold">Intent</h2>
          <div className="flex flex-wrap gap-2">
            {INTENTS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => patch({ intent: i })}
                className={profile.intent === i ? 'opacity-100' : 'opacity-40'}
              >
                <IntentBadge intent={i} />
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
          <section className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-white p-4">
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
          <h2 className="mb-2 font-display text-lg font-bold">Interests</h2>
          <div className="flex flex-wrap gap-2">
            {profile.interests.map((i) => (
              <span key={i.id} className="rounded-full border border-line px-3 py-1 text-sm">
                {i.emoji} {i.label}
              </span>
            ))}
          </div>
        </section>

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

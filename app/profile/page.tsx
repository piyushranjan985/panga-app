'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import IntentBadge from '@/components/IntentBadge';
import { getCurrentPosition } from '@/lib/native';
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
  subCommunities: { id: string; label: string; tribe: { id: string; label: string; emoji: string; personaLabel: string } }[];
  relationshipStyles: { id: string; label: string; emoji: string }[];
  answers: { id: string; answer: string; prompt: { id: string; text: string; emoji: string; optionA: string; optionB: string } }[];
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
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: string | null;
}

// Reference catalogs (with real DB ids) for the inline "edit here" pickers
// below -- the same data app/onboarding/page.tsx fetches from
// /api/onboarding-options to render its pick-lists, reused here so editing
// a section on the profile screen feels identical to picking it the first
// time, without redoing the whole onboarding flow.
interface CatalogItem { id: string; label: string; emoji: string; intents: string[] }
interface CatalogTribe { id: string; slug: string; label: string; emoji: string; personaLabel: string; intents: string[] }
interface CatalogSub { id: string; tribeId: string; label: string }
interface CatalogRelationshipStyle { id: string; label: string; emoji: string }
interface CatalogPrompt { id: string; text: string; emoji: string; optionA: string; optionB: string; intents: string[] }
interface Catalog {
  interests: CatalogItem[];
  tribes: CatalogTribe[];
  subCommunities: CatalogSub[];
  relationshipStyles: CatalogRelationshipStyle[];
  prompts: CatalogPrompt[];
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
const TRIBE_MAX = 4; // matches app/onboarding/page.tsx's tribeMax

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

function toggleId(list: string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((v) => v !== id);
  if (list.length >= max) return list;
  return [...list, id];
}

// A pick-list chip, used identically in read-only display and in edit
// mode (just fed a different onClick) -- keeps every section's picker
// looking and behaving the same way.
function Chip({
  label,
  emoji,
  selected,
  disabled,
  onClick,
  tone = 'magenta',
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: 'magenta' | 'mint';
}) {
  const active = tone === 'mint' ? 'border-mint bg-mint/10 text-mint' : 'border-magenta bg-magenta/10 text-magenta';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${selected ? active : 'border-line'} ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {emoji ? `${emoji} ` : ''}
      {label}
    </button>
  );
}

// Small pencil affordance that opens a section's edit mode -- shown next
// to a section heading only once the edit catalog has loaded (so it never
// opens onto empty pick-lists).
function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-inkSoft transition hover:border-magenta hover:text-magenta"
    >
      ✏️ Edit
    </button>
  );
}

// Shared Save/Cancel bar for every inline editor below.
function EditActions({
  onSave,
  onCancel,
  saving,
  disabled,
  hint,
  error,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-xs">{error ? <span className="font-semibold text-magenta">{error}</span> : <span className="text-inkSoft">{hint}</span>}</p>
      <div className="flex flex-none gap-2">
        <button type="button" onClick={onCancel} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-inkSoft">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || disabled}
          className="gradient-btn rounded-full px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

type EditSection =
  | 'bio'
  | 'interests'
  | 'tribes'
  | 'relationship'
  | 'datevibe'
  | 'tonight'
  | 'values'
  | 'living'
  | 'future'
  | 'children'
  | 'vybecheck';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Inline "edit here" state -- one section open at a time, so a handful
  // of generic draft slots (reset whenever a section opens) is simpler
  // than a form per field. See the section renderers below for how each
  // one is used.
  const [editing, setEditing] = useState<EditSection | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [draftBio, setDraftBio] = useState('');
  const [draftIds, setDraftIds] = useState<string[]>([]); // interests / relationship / date vibe / tonight / values
  const [draftTribeIds, setDraftTribeIds] = useState<string[]>([]);
  const [draftSubIds, setDraftSubIds] = useState<string[]>([]);
  const [draftSingle, setDraftSingle] = useState(''); // living preference / children
  const [draftFuture, setDraftFuture] = useState({ home: '', family: '', career: '', money: '' });
  const [draftPromptAnswers, setDraftPromptAnswers] = useState<{ promptId: string; answer: string }[]>([]);

  function load() {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => setProfile(d.profile));
  }

  useEffect(() => {
    load();
    // Same reference data onboarding uses -- fetched once up front so
    // every "Edit" button below can open straight into a picker instead
    // of showing a spinner.
    fetch('/api/onboarding-options')
      .then((r) => r.json())
      .then((d) =>
        setCatalog({
          interests: d.interests ?? [],
          tribes: d.tribes ?? [],
          subCommunities: d.subCommunities ?? [],
          relationshipStyles: d.relationshipStyles ?? [],
          prompts: d.prompts ?? [],
        })
      );
  }, []);

  function closeEdit() {
    setEditing(null);
    setSectionError(null);
  }

  // Every section's Save button funnels through here -- PATCH now returns
  // the full profile (same shape GET returns, see app/api/profile/route.ts)
  // so the whole page just re-syncs from the response instead of hand-
  // merging each field's shape back into local state.
  async function saveSection(payload: Record<string, unknown>) {
    setSavingSection(true);
    setSectionError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save');
      setProfile(data.profile);
      setEditing(null);
    } catch (err) {
      setSectionError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSavingSection(false);
    }
  }

  function toggleDraftTribe(tribeId: string) {
    setDraftTribeIds((prev) => {
      if (prev.includes(tribeId)) {
        setDraftSubIds((subs) => subs.filter((id) => catalog?.subCommunities.find((s) => s.id === id)?.tribeId !== tribeId));
        return prev.filter((id) => id !== tribeId);
      }
      if (prev.length >= TRIBE_MAX) return prev;
      return [...prev, tribeId];
    });
  }

  function toggleDraftSub(subId: string, tribeId: string) {
    setDraftSubIds((prev) => {
      if (prev.includes(subId)) return prev.filter((id) => id !== subId);
      const subsForTribe = catalog?.subCommunities.filter((s) => s.tribeId === tribeId) ?? [];
      const pickedForTribe = prev.filter((id) => subsForTribe.some((s) => s.id === id)).length;
      if (pickedForTribe >= 3) return prev;
      return [...prev, subId];
    });
  }

  async function patch(update: Partial<Pick<ProfileData, 'quietMode' | 'familyPreviewOn'>>) {
    setProfile((p) => (p ? { ...p, ...update } : p));
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }

  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Opt-in only -- the browser's own permission prompt is the consent UI,
  // triggered only by this explicit tap, never on page load. Raw
  // coordinates never leave this device except to this one endpoint;
  // everyone else only ever sees a rounded distance (see lib/geo.ts).
  async function shareLocation() {
    setLocationBusy(true);
    setLocationError(null);
    try {
      // Goes through the native permission dialog + location provider when
      // this is running inside the iOS/Android app shell, and the ordinary
      // browser Geolocation API otherwise -- see lib/native.ts.
      const { latitude, longitude } = await getCurrentPosition();
      const res = await fetch('/api/profile/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude }),
      });
      const data = await res.json();
      setProfile((p) => (p ? { ...p, latitude, longitude, locationUpdatedAt: data.locationUpdatedAt } : p));
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get your location. Try again.');
    } finally {
      setLocationBusy(false);
    }
  }

  async function clearLocation() {
    setLocationBusy(true);
    await fetch('/api/profile/location', { method: 'DELETE' });
    setProfile((p) => (p ? { ...p, latitude: null, longitude: null, locationUpdatedAt: null } : p));
    setLocationBusy(false);
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
  const vybeMax = profile.intent === 'RISHTA_READY' ? 3 : 2;
  const futureVibeAnswers = [
    futureVibeAnswer('home', profile.futureHome),
    futureVibeAnswer('family', profile.futureFamily),
    futureVibeAnswer('career', profile.futureCareer),
    futureVibeAnswer('money', profile.futureMoney),
  ].filter((a): a is { question: string; option: { slug: string; label: string; emoji: string } } => Boolean(a));
  const livingPreference = profile.livingPreference ? LIVING_PREFERENCE_BY_SLUG.get(profile.livingPreference) : null;
  const childrenPreference = profile.children ? CHILDREN_BY_SLUG.get(profile.children) : null;
  const tribesIncomplete =
    draftTribeIds.length === 0 ||
    draftTribeIds.some(
      (tribeId) => !draftSubIds.some((id) => catalog?.subCommunities.find((s) => s.id === id)?.tribeId === tribeId)
    );

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

        <section className="mt-4">
          {editing === 'bio' ? (
            <div>
              <textarea
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value.slice(0, 280))}
                rows={3}
                placeholder="Tell people your vibe..."
                className="w-full rounded-2xl border border-line bg-white p-3 text-sm outline-none focus:border-magenta"
              />
              <EditActions
                onSave={() => saveSection({ bio: draftBio.trim() })}
                onCancel={closeEdit}
                saving={savingSection}
                hint={`${draftBio.length}/280`}
                error={sectionError}
              />
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              {/* Bio is optional -- nothing shown at all when it's empty,
                  not a placeholder nudge. The edit affordance stays either
                  way, so it's still just as easy to add one. */}
              <p className="text-sm text-inkSoft">{profile.bio}</p>
              <EditButton
                label="Edit bio"
                onClick={() => {
                  setDraftBio(profile.bio);
                  setSectionError(null);
                  setEditing('bio');
                }}
              />
            </div>
          )}
        </section>

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

        <section className="mt-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">📍 Location</p>
              <p className="text-sm text-inkSoft">
                {profile.latitude != null
                  ? 'Shared — lets matches see how far away you are.'
                  : 'Off — matches won’t see a distance for you.'}
              </p>
            </div>
            {profile.latitude != null ? (
              <button
                type="button"
                onClick={clearLocation}
                disabled={locationBusy}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                Turn off
              </button>
            ) : (
              <button
                type="button"
                onClick={shareLocation}
                disabled={locationBusy}
                className="gradient-btn shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {locationBusy ? 'Getting location…' : 'Share location'}
              </button>
            )}
          </div>
          {locationError && <p className="mt-2 text-xs text-magenta">{locationError}</p>}
          <p className="mt-2 text-[11px] text-inkSoft/70">
            Only a rounded distance (e.g. "3 km away") is ever shown to anyone else — never your exact location.
          </p>
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
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">What I&apos;m into</h2>
            {editing !== 'interests' && catalog && (
              <EditButton
                label="Edit interests"
                onClick={() => {
                  setDraftIds(profile.interests.map((i) => i.id));
                  setSectionError(null);
                  setEditing('interests');
                }}
              />
            )}
          </div>
          {editing === 'interests' && catalog ? (
            <div>
              <div className="flex flex-wrap gap-2">
                {catalog.interests
                  .filter((i) => i.intents.length === 0 || i.intents.includes(profile.intent))
                  .map((i) => {
                    const selected = draftIds.includes(i.id);
                    const disabled = !selected && draftIds.length >= 8;
                    return (
                      <Chip
                        key={i.id}
                        label={i.label}
                        emoji={i.emoji}
                        selected={selected}
                        disabled={disabled}
                        onClick={() => setDraftIds((prev) => toggleId(prev, i.id, 8))}
                      />
                    );
                  })}
              </div>
              <EditActions
                onSave={() => saveSection({ interestIds: draftIds })}
                onCancel={closeEdit}
                saving={savingSection}
                disabled={draftIds.length < 5}
                hint={`${draftIds.length} of 8 picked${draftIds.length < 5 ? ' — pick at least 5' : ''}`}
                error={sectionError}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((i) => (
                <span key={i.id} className="rounded-full border border-line px-3 py-1 text-sm">
                  {i.emoji} {i.label}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Vybe Check</h2>
            {editing !== 'vybecheck' && catalog && (
              <EditButton
                label="Edit Vybe Check"
                onClick={() => {
                  setDraftPromptAnswers(profile.answers.map((a) => ({ promptId: a.prompt.id, answer: a.answer })));
                  setSectionError(null);
                  setEditing('vybecheck');
                }}
              />
            )}
          </div>
          <p className="mb-2 text-xs text-inkSoft">The prompts people unlock about you on the feed.</p>
          {editing === 'vybecheck' && catalog ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-inkSoft">Pick {vybeMax === 3 ? '2 to 3' : '2'} prompts, then pick a side on each.</p>
              <div className="flex flex-wrap gap-2">
                {catalog.prompts
                  .filter((p) => p.intents.length === 0 || p.intents.includes(profile.intent))
                  .map((p) => {
                    const selected = draftPromptAnswers.some((pa) => pa.promptId === p.id);
                    const disabled = !selected && draftPromptAnswers.length >= vybeMax;
                    return (
                      <Chip
                        key={p.id}
                        label={p.text}
                        emoji={p.emoji}
                        selected={selected}
                        disabled={disabled}
                        onClick={() =>
                          setDraftPromptAnswers((prev) =>
                            prev.some((pa) => pa.promptId === p.id)
                              ? prev.filter((pa) => pa.promptId !== p.id)
                              : prev.length >= vybeMax
                                ? prev
                                : [...prev, { promptId: p.id, answer: '' }]
                          )
                        }
                      />
                    );
                  })}
              </div>
              {draftPromptAnswers.length > 0 && (
                <div className="flex flex-col gap-3">
                  {draftPromptAnswers.map((pa) => {
                    const prompt = catalog.prompts.find((p) => p.id === pa.promptId);
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
                              onClick={() =>
                                setDraftPromptAnswers((prev) =>
                                  prev.map((x) => (x.promptId === pa.promptId ? { ...x, answer: option } : x))
                                )
                              }
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
              <EditActions
                onSave={() => saveSection({ promptAnswers: draftPromptAnswers })}
                onCancel={closeEdit}
                saving={savingSection}
                disabled={draftPromptAnswers.length < 2 || draftPromptAnswers.some((pa) => !pa.answer)}
                hint={`${draftPromptAnswers.length} of ${vybeMax} picked`}
                error={sectionError}
              />
            </div>
          ) : profile.answers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {profile.answers.map((a) => (
                <div key={a.id} className="rounded-2xl border border-line bg-white p-3">
                  <p className="text-xs font-semibold text-inkSoft">
                    {a.prompt.emoji} {a.prompt.text}
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    {[a.prompt.optionA, a.prompt.optionB].map((option) => (
                      <span
                        key={option}
                        className={`flex-1 rounded-xl border px-3 py-1.5 text-center text-sm font-semibold ${
                          option === a.answer ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line text-inkSoft/50'
                        }`}
                      >
                        {option}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-inkSoft">No Vybe Check answers yet.</p>
          )}
        </section>

        {(profile.intent === 'SOMETHING_REAL' || profile.intent === 'RISHTA_READY') && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">My tribes</h2>
              {editing !== 'tribes' && catalog && (
                <EditButton
                  label="Edit tribes"
                  onClick={() => {
                    setDraftTribeIds(profile.tribes.map((t) => t.id));
                    setDraftSubIds(profile.subCommunities.map((s) => s.id));
                    setSectionError(null);
                    setEditing('tribes');
                  }}
                />
              )}
            </div>
            {editing === 'tribes' && catalog ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-inkSoft">
                  Pick up to {TRIBE_MAX} tribes, then 1 to 3 specific communities under each.
                </p>
                <div className="flex flex-wrap gap-2">
                  {catalog.tribes
                    .filter((t) => t.intents.length === 0 || t.intents.includes(profile.intent))
                    .map((t) => {
                      const selected = draftTribeIds.includes(t.id);
                      const disabled = !selected && draftTribeIds.length >= TRIBE_MAX;
                      return (
                        <Chip
                          key={t.id}
                          label={t.label}
                          emoji={t.emoji}
                          selected={selected}
                          disabled={disabled}
                          onClick={() => toggleDraftTribe(t.id)}
                        />
                      );
                    })}
                </div>
                {draftTribeIds.map((tribeId) => {
                  const tribe = catalog.tribes.find((t) => t.id === tribeId);
                  if (!tribe) return null;
                  const subsForTribe = catalog.subCommunities.filter((s) => s.tribeId === tribeId);
                  const pickedForTribe = draftSubIds.filter((id) => subsForTribe.some((s) => s.id === id)).length;
                  return (
                    <div key={tribeId} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
                      <p className="text-sm font-semibold">
                        {tribe.emoji} {tribe.label} — pick 1 to 3
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {subsForTribe.map((s) => {
                          const selected = draftSubIds.includes(s.id);
                          const disabled = !selected && pickedForTribe >= 3;
                          return (
                            <Chip
                              key={s.id}
                              label={s.label}
                              selected={selected}
                              disabled={disabled}
                              tone="mint"
                              onClick={() => toggleDraftSub(s.id, tribeId)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <EditActions
                  onSave={() => saveSection({ tribeIds: draftTribeIds, subCommunityIds: draftSubIds })}
                  onCancel={closeEdit}
                  saving={savingSection}
                  disabled={tribesIncomplete}
                  hint={
                    draftTribeIds.length === 0
                      ? 'Pick at least 1 tribe'
                      : tribesIncomplete
                        ? 'Pick at least 1 community for each tribe'
                        : `${draftTribeIds.length} of ${TRIBE_MAX} tribes picked`
                  }
                  error={sectionError}
                />
              </div>
            ) : profile.tribes.length > 0 ? (
              <div className="flex flex-col gap-2">
                {profile.tribes.map((t) => {
                  const subs = profile.subCommunities.filter((s) => s.tribe.id === t.id);
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-line px-3 py-1 text-sm font-semibold">
                        {t.emoji} {t.personaLabel || t.label}
                      </span>
                      {subs.map((s) => (
                        <span key={s.id} className="rounded-full border border-mint/40 bg-mint/10 px-2.5 py-1 text-xs font-semibold text-mint">
                          {s.label}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-inkSoft">No tribes picked yet.</p>
            )}
          </section>
        )}

        {profile.intent === 'SOMETHING_REAL' && (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">My ideal relationship is&hellip;</h2>
              {editing !== 'relationship' && catalog && (
                <EditButton
                  label="Edit relationship vibe"
                  onClick={() => {
                    setDraftIds(profile.relationshipStyles.map((r) => r.id));
                    setSectionError(null);
                    setEditing('relationship');
                  }}
                />
              )}
            </div>
            {editing === 'relationship' && catalog ? (
              <div>
                <div className="flex flex-wrap gap-2">
                  {catalog.relationshipStyles.map((r) => {
                    const selected = draftIds.includes(r.id);
                    const disabled = !selected && draftIds.length >= 3;
                    return (
                      <Chip
                        key={r.id}
                        label={r.label}
                        emoji={r.emoji}
                        selected={selected}
                        disabled={disabled}
                        onClick={() => setDraftIds((prev) => toggleId(prev, r.id, 3))}
                      />
                    );
                  })}
                </div>
                <EditActions
                  onSave={() => saveSection({ relationshipStyleIds: draftIds })}
                  onCancel={closeEdit}
                  saving={savingSection}
                  disabled={draftIds.length !== 3}
                  hint={`${draftIds.length} of 3 picked`}
                  error={sectionError}
                />
              </div>
            ) : profile.relationshipStyles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.relationshipStyles.map((r) => (
                  <span key={r.id} className="rounded-full border border-line px-3 py-1 text-sm">
                    {r.emoji} {r.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-inkSoft">Not picked yet.</p>
            )}
          </section>
        )}

        {profile.intent === 'JUST_VIBING' && (
          <>
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">My kind of date</h2>
                {editing !== 'datevibe' && (
                  <EditButton
                    label="Edit date vibe"
                    onClick={() => {
                      setDraftIds(profile.dateVibeTags);
                      setSectionError(null);
                      setEditing('datevibe');
                    }}
                  />
                )}
              </div>
              {editing === 'datevibe' ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {DATE_VIBES.map((d) => {
                      const selected = draftIds.includes(d.slug);
                      const disabled = !selected && draftIds.length >= 3;
                      return (
                        <Chip
                          key={d.slug}
                          label={d.label}
                          emoji={d.emoji}
                          selected={selected}
                          disabled={disabled}
                          onClick={() => setDraftIds((prev) => toggleId(prev, d.slug, 3))}
                        />
                      );
                    })}
                  </div>
                  <EditActions
                    onSave={() => saveSection({ dateVibeTags: draftIds })}
                    onCancel={closeEdit}
                    saving={savingSection}
                    disabled={draftIds.length !== 3}
                    hint={`${draftIds.length} of 3 picked`}
                    error={sectionError}
                  />
                </div>
              ) : profile.dateVibeTags.length > 0 ? (
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
              ) : (
                <p className="text-sm text-inkSoft">Not picked yet.</p>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Looking for tonight</h2>
                {editing !== 'tonight' && (
                  <EditButton
                    label="Edit tonight"
                    onClick={() => {
                      setDraftIds(profile.tonightTags);
                      setSectionError(null);
                      setEditing('tonight');
                    }}
                  />
                )}
              </div>
              {editing === 'tonight' ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {TONIGHT_OPTIONS.map((t) => {
                      const selected = draftIds.includes(t.slug);
                      const disabled = !selected && draftIds.length >= 2;
                      return (
                        <Chip
                          key={t.slug}
                          label={t.label}
                          emoji={t.emoji}
                          selected={selected}
                          disabled={disabled}
                          onClick={() => setDraftIds((prev) => toggleId(prev, t.slug, 2))}
                        />
                      );
                    })}
                  </div>
                  <EditActions
                    onSave={() => saveSection({ tonightTags: draftIds })}
                    onCancel={closeEdit}
                    saving={savingSection}
                    hint={`${draftIds.length} of 2 picked (optional)`}
                    error={sectionError}
                  />
                </div>
              ) : profile.tonightTags.length > 0 ? (
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
              ) : (
                <p className="text-sm text-inkSoft">Not picked yet.</p>
              )}
            </section>
          </>
        )}

        {profile.intent === 'RISHTA_READY' && (
          <>
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">What matters most</h2>
                {editing !== 'values' && (
                  <EditButton
                    label="Edit values"
                    onClick={() => {
                      setDraftIds(profile.valuesTags);
                      setSectionError(null);
                      setEditing('values');
                    }}
                  />
                )}
              </div>
              {editing === 'values' ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {VALUES_OPTIONS.map((v) => {
                      const selected = draftIds.includes(v.slug);
                      const disabled = !selected && draftIds.length >= 4;
                      return (
                        <Chip
                          key={v.slug}
                          label={v.label}
                          emoji={v.emoji}
                          selected={selected}
                          disabled={disabled}
                          onClick={() => setDraftIds((prev) => toggleId(prev, v.slug, 4))}
                        />
                      );
                    })}
                  </div>
                  <EditActions
                    onSave={() => saveSection({ valuesTags: draftIds })}
                    onCancel={closeEdit}
                    saving={savingSection}
                    disabled={draftIds.length !== 4}
                    hint={`${draftIds.length} of 4 picked`}
                    error={sectionError}
                  />
                </div>
              ) : profile.valuesTags.length > 0 ? (
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
              ) : (
                <p className="text-sm text-inkSoft">Not picked yet.</p>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Where I see myself living</h2>
                {editing !== 'living' && (
                  <EditButton
                    label="Edit living preference"
                    onClick={() => {
                      setDraftSingle(profile.livingPreference ?? '');
                      setSectionError(null);
                      setEditing('living');
                    }}
                  />
                )}
              </div>
              {editing === 'living' ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {LIVING_PREFERENCES.map((l) => (
                      <Chip
                        key={l.slug}
                        label={l.label}
                        emoji={l.emoji}
                        selected={draftSingle === l.slug}
                        onClick={() => setDraftSingle(l.slug)}
                      />
                    ))}
                  </div>
                  <EditActions
                    onSave={() => saveSection({ livingPreference: draftSingle })}
                    onCancel={closeEdit}
                    saving={savingSection}
                    disabled={!draftSingle}
                    error={sectionError}
                  />
                </div>
              ) : livingPreference ? (
                <span className="rounded-full border border-line px-3 py-1 text-sm">
                  {livingPreference.emoji} {livingPreference.label}
                </span>
              ) : (
                <p className="text-sm text-inkSoft">Not picked yet.</p>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Future vibe</h2>
                {editing !== 'future' && (
                  <EditButton
                    label="Edit future vibe"
                    onClick={() => {
                      setDraftFuture({
                        home: profile.futureHome ?? '',
                        family: profile.futureFamily ?? '',
                        career: profile.futureCareer ?? '',
                        money: profile.futureMoney ?? '',
                      });
                      setSectionError(null);
                      setEditing('future');
                    }}
                  />
                )}
              </div>
              {editing === 'future' ? (
                <div className="flex flex-col gap-3">
                  {FUTURE_VIBE_QUESTIONS.map((q) => {
                    const key = q.key as 'home' | 'family' | 'career' | 'money';
                    const value = draftFuture[key];
                    return (
                      <div key={q.key} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
                        <p className="text-sm font-semibold">{q.question}</p>
                        <div className="flex gap-2">
                          {[q.optionA, q.optionB].map((option) => (
                            <button
                              key={option.slug}
                              type="button"
                              onClick={() => setDraftFuture((f) => ({ ...f, [key]: option.slug }))}
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
                  <EditActions
                    onSave={() =>
                      saveSection({
                        futureHome: draftFuture.home,
                        futureFamily: draftFuture.family,
                        futureCareer: draftFuture.career,
                        futureMoney: draftFuture.money,
                      })
                    }
                    onCancel={closeEdit}
                    saving={savingSection}
                    disabled={!draftFuture.home || !draftFuture.family || !draftFuture.career || !draftFuture.money}
                    error={sectionError}
                  />
                </div>
              ) : futureVibeAnswers.length > 0 ? (
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
              ) : (
                <p className="text-sm text-inkSoft">Not picked yet.</p>
              )}
            </section>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">On children</h2>
                {editing !== 'children' && (
                  <EditButton
                    label="Edit children preference"
                    onClick={() => {
                      setDraftSingle(profile.children ?? '');
                      setSectionError(null);
                      setEditing('children');
                    }}
                  />
                )}
              </div>
              {editing === 'children' ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {CHILDREN_OPTIONS.map((c) => (
                      <Chip
                        key={c.slug}
                        label={c.label}
                        emoji={c.emoji}
                        selected={draftSingle === c.slug}
                        onClick={() => setDraftSingle(c.slug)}
                      />
                    ))}
                  </div>
                  <EditActions
                    onSave={() => saveSection({ children: draftSingle })}
                    onCancel={closeEdit}
                    saving={savingSection}
                    disabled={!draftSingle}
                    error={sectionError}
                  />
                </div>
              ) : childrenPreference ? (
                <span className="rounded-full border border-line px-3 py-1 text-sm">
                  {childrenPreference.emoji} {childrenPreference.label}
                </span>
              ) : (
                <p className="text-sm text-inkSoft">Not picked yet.</p>
              )}
            </section>
          </>
        )}

        {/* Help & Support: same reasoning as the Log out button just
            below -- this needs to be reachable from a phone-width screen,
            not just tucked into a desktop-only nav link. */}
        <section className="mt-8">
          <Link
            href="/help"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3 text-sm font-bold text-inkSoft"
          >
            💬 Help &amp; Support
          </Link>
        </section>

        {/* Navbar's own "Log out" link is desktop-only (sm:block) -- on a
            phone-width screen (including the native iOS/Android app,
            which is always phone-width) there was no way to find it at
            all. This is the one that actually shows up everywhere. */}
        <section className="mt-4 mb-4">
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/');
              router.refresh();
            }}
            className="w-full rounded-2xl border border-line bg-white py-3 text-sm font-bold text-inkSoft"
          >
            Log out
          </button>
        </section>
      </main>
    </div>
  );
}

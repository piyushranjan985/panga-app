'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CITIES } from '@/lib/constants';

type Circle = { id: string; name: string; category: string; city: string | null };
type Interest = { id: string; label: string; emoji: string };

const INTENTS = [
  { value: 'JUST_VIBING', label: 'Just Vibing', emoji: '🌀', blurb: 'No labels, no pressure, just good energy' },
  { value: 'SOMETHING_REAL', label: 'Something Real', emoji: '💛', blurb: 'Dating, with an actual future in mind' },
  { value: 'RISHTA_READY', label: 'Rishta Ready', emoji: '💍', blurb: "Serious, family-aware, ready when it's right" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    displayName: '',
    dateOfBirth: '',
    gender: 'WOMAN',
    lookingFor: ['MAN'] as string[],
    city: CITIES[0],
    bio: '',
    intent: 'SOMETHING_REAL',
    interestIds: [] as string[],
    circleIds: [] as string[],
    avatarHue: Math.ceil(Math.random() * 6),
  });

  useEffect(() => {
    fetch('/api/circles')
      .then((r) => r.json())
      .then((d) => {
        setCircles(d.circles ?? []);
        setInterests(d.interests ?? []);
      });
  }, []);

  function toggle<T>(list: T[], value: T, max: number): T[] {
    if (list.includes(value)) return list.filter((v) => v !== value);
    if (list.length >= max) return list;
    return [...list, value];
  }

  // Intent goes first on purpose — it's the one question none of the big
  // dating or matrimony apps ask upfront (see the "Intent First" concept:
  // Tinder/Bumble never ask, Shaadi/Jeevansathi ask about identity instead).
  const steps = ['Intent', 'Basics', 'Interests', 'Circles'];

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save profile');
      router.push('/discover');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-marigold">
          Step {step + 1} of {steps.length} — {steps[step]}
        </p>
        <div className="mt-2 flex gap-1.5">
          {steps.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-magenta' : 'bg-line'}`} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">What are you here for?</h1>
          <p className="text-sm text-inkSoft">Pick your lane — we&apos;ll only show you people on the same page.</p>
          {INTENTS.map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => setForm({ ...form, intent: i.value })}
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
          <p className="text-xs text-inkSoft">You can change this anytime — vibes shift.</p>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-extrabold">First, the basics</h1>
          <input
            placeholder="What should we call you?"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="rounded-2xl border border-line px-4 py-3"
          />
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            className="rounded-2xl border border-line px-4 py-3"
          />
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
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Pick up to 8 interests</h1>
          <div className="flex flex-wrap gap-2">
            {interests.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setForm({ ...form, interestIds: toggle(form.interestIds, i.id, 8) })}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  form.interestIds.includes(i.id) ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                }`}
              >
                {i.emoji} {i.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Join up to 6 circles</h1>
          <p className="text-sm text-inkSoft">College, city, and interest communities — this is how discovery works.</p>
          <div className="flex flex-wrap gap-2">
            {circles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setForm({ ...form, circleIds: toggle(form.circleIds, c.id, 6) })}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  form.circleIds.includes(c.id) ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-magenta">{error}</p>}

      <div className="mt-auto flex justify-between pt-4">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-inkSoft disabled:opacity-0"
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 1 && !form.displayName}
            className="gradient-btn rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className="gradient-btn rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Finish & discover'}
          </button>
        )}
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CITIES } from '@/lib/constants';
import IntentBadge from '@/components/IntentBadge';

type Circle = { id: string; name: string; category: string; city: string | null };
type Interest = { id: string; label: string; emoji: string };
type Prompt = { id: string; text: string; emoji: string };

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
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
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
    promptAnswers: [] as { promptId: string; answer: string }[],
    familyPreviewOn: false,
    avatarHue: Math.ceil(Math.random() * 6),
  });

  useEffect(() => {
    fetch('/api/circles')
      .then((r) => r.json())
      .then((d) => {
        setCircles(d.circles ?? []);
        setInterests(d.interests ?? []);
        setPrompts(d.prompts ?? []);
      });
    // Known as soon as someone's signed in (from the OTP/social step, well
    // before a Profile row exists) — fetched here only to preview the
    // Family Preview link before they've finished onboarding.
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMyUserId(d.userId ?? null));
  }, []);

  function toggle<T>(list: T[], value: T, max: number): T[] {
    if (list.includes(value)) return list.filter((v) => v !== value);
    if (list.length >= max) return list;
    return [...list, value];
  }

  // Same 18-100 window app/api/profile/route.ts enforces server-side — this
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

  // Circles fetched once cover every city and every category (college,
  // city, interest, festival) — see lib/constants.ts. The picker only
  // offers circles relevant to the city someone just chose: college/campus
  // circles are left out entirely for now (too easy to end up in someone
  // else's alma mater's circle), and city-bound circles from other cities
  // are hidden. Circles with no city (festival/national ones like Diwali
  // Foodies) stay visible everywhere.
  const visibleCircles = circles.filter(
    (c) => c.category !== 'college' && (c.city === null || c.city === form.city)
  );

  // Vybe Check: pick up to 2 prompts and actually answer them. Interests
  // and circles exist on every dating app — this is VybeMatch's own thing.
  // The swipe card (components/VibeCard.tsx) already blurs a profile behind
  // these answers and reveals them one tap at a time ("no guessing games"
  // is the whole pitch), but nothing in onboarding ever collected them, so
  // every real profile was silently falling back to a plain interest list.
  function togglePrompt(promptId: string) {
    setForm((f) => {
      const exists = f.promptAnswers.some((pa) => pa.promptId === promptId);
      if (exists) return { ...f, promptAnswers: f.promptAnswers.filter((pa) => pa.promptId !== promptId) };
      if (f.promptAnswers.length >= 2) return f;
      return { ...f, promptAnswers: [...f.promptAnswers, { promptId, answer: '' }] };
    });
  }
  function updatePromptAnswer(promptId: string, answer: string) {
    setForm((f) => ({
      ...f,
      promptAnswers: f.promptAnswers.map((pa) => (pa.promptId === promptId ? { ...pa, answer } : pa)),
    }));
  }
  const vybeCheckIncomplete =
    form.promptAnswers.length === 0 || form.promptAnswers.some((pa) => !pa.answer.trim());

  // Family Preview: a curated, read-only summary (name, age, city, intent,
  // circles — no bio, no Vybe Check answers, nothing from the swipe deck)
  // that's shareable outside the app. It's the one piece of the matrimony
  // side of "dating/matrimony hybrid" that no swipe app has and no
  // matrimony site makes optional — off by default, and only offered to
  // people who picked Rishta Ready.
  const previewUrl = myUserId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/preview/${myUserId}` : null;

  // Intent goes first on purpose — it's the one question none of the big
  // dating or matrimony apps ask upfront (see the "Intent First" concept:
  // Tinder/Bumble never ask, Shaadi/Jeevansathi ask about identity instead).
  const steps =
    form.intent === 'RISHTA_READY'
      ? ['Intent', 'Basics', 'Interests', 'Circles', 'Vybe Check', 'Family Preview']
      : ['Intent', 'Basics', 'Interests', 'Circles', 'Vybe Check'];

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
              <p className="text-xs font-medium text-magenta">You must be 18 or older to use VybeMatch.</p>
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
          <p className="text-sm text-inkSoft">Local and interest communities in {form.city} — this is how discovery works.</p>
          <div className="flex flex-wrap gap-2">
            {visibleCircles.map((c) => (
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

      {step === 4 && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Vybe Check</h1>
          <p className="text-sm text-inkSoft">
            Pick 2 prompts and actually answer them. On the feed, people meet these first — your photo and name
            stay blurred until they reveal your answers. That&apos;s &quot;no guessing games,&quot; for real.
          </p>
          <div className="flex flex-wrap gap-2">
            {prompts.map((p) => {
              const selected = form.promptAnswers.some((pa) => pa.promptId === p.id);
              const disabled = !selected && form.promptAnswers.length >= 2;
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
                    <input
                      value={pa.answer}
                      onChange={(e) => updatePromptAnswer(pa.promptId, e.target.value)}
                      placeholder="Your answer..."
                      maxLength={140}
                      className="rounded-xl border border-line px-3 py-2 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 5 && form.intent === 'RISHTA_READY' && (
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-extrabold">Family Preview</h1>
          <p className="text-sm text-inkSoft">
            An optional, read-only introduction card you can share outside VybeMatch — with family, say. Far less
            than your real profile: just your name, age, city, intent, and circles. No bio, no Vybe Check answers,
            nothing from the swipe deck. Off by default, and you can turn it off anytime from your profile.
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
            disabled={
              (step === 1 && (!form.displayName || !form.dateOfBirth || dobTooYoung)) ||
              (step === 4 && vybeCheckIncomplete)
            }
            className="gradient-btn rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={saving || vybeCheckIncomplete}
            className="gradient-btn rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Finish & discover'}
          </button>
        )}
      </div>
    </main>
  );
}

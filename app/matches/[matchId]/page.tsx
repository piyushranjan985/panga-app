'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import IntentBadge from '@/components/IntentBadge';
import {
  pickStarter,
  askQuestionFor,
  PLAN_ACTIVITIES,
  PLAN_VIBES,
  type SharedProfileBits,
  type StarterOption,
} from '@/lib/conversationStarters';

interface PromptMeta {
  question: string;
  emoji: string;
  options: [StarterOption, StarterOption];
}
interface PlanMeta {
  activity: StarterOption;
  vibe: string;
}

interface Message {
  id: string;
  senderId: string;
  body: string;
  kind: 'TEXT' | 'PROMPT' | 'PLAN';
  meta: PromptMeta | PlanMeta | null;
  createdAt: string;
}

interface VibeMatch {
  percent: number;
  sharedInterests: { emoji: string; label: string }[];
  sharedTribes: { emoji: string; label: string }[];
  sharedWorldsCount: number;
  sharedWorldLines: string[];
  relationshipLines: string[];
}

interface Partner {
  userId: string;
  displayName: string;
  age: number;
  city: string;
  intent: string;
  avatarSeed: string;
  avatarHue: number;
  photoUrl: string | null;
  interests: { id: string; label: string; emoji: string }[];
  tribes: { id: string; slug: string; label: string; emoji: string; personaLabel: string }[];
  relationshipStyles: { id: string; label: string; emoji: string }[];
}

const REPORT_REASONS = ['Inappropriate messages', 'Fake profile', 'Harassment', 'Spam or scam', 'Other'] as const;

export default function ChatPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [vibe, setVibe] = useState<VibeMatch | null>(null);
  const [shared, setShared] = useState<SharedProfileBits>({ interestLabels: [], tribeSlugs: [] });
  const [partner, setPartner] = useState<Partner | null>(null);
  const [usedStarters, setUsedStarters] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Every overlay this screen can show, one at a time -- keeps "keep the
  // post-match experience simple" true here too: nothing stacks on top of
  // anything else.
  const [panel, setPanel] = useState<'none' | 'menu' | 'profile' | 'askAbout' | 'plan' | 'report'>('none');
  const [planActivity, setPlanActivity] = useState<StarterOption | null>(null);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]>(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [meRes, msgRes] = await Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch(`/api/matches/${params.matchId}/messages`).then((r) => r.json()),
    ]);
    setMyUserId(meRes.userId ?? null);
    setMessages(msgRes.messages ?? []);
  }

  useEffect(() => {
    load();
    // Simple polling for the MVP — swap for a WebSocket/Pusher channel
    // before real launch (see the scaling section of the strategy doc).
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchId]);

  useEffect(() => {
    // Vibe Match doesn't change between two people's fixed picks, so this
    // is fetched once — no reason to put it on the 4s message poll. Also
    // carries the raw shared interest/tribe keys lib/conversationStarters
    // needs (see app/api/matches/[matchId]/vibe/route.ts).
    fetch(`/api/matches/${params.matchId}/vibe`)
      .then((r) => r.json())
      .then((d) => {
        setVibe(d.vibe ?? null);
        setShared({ interestLabels: d.sharedInterestLabels ?? [], tribeSlugs: d.sharedTribeSlugs ?? [] });
      });
    fetch(`/api/matches/${params.matchId}/partner`)
      .then((r) => r.json())
      .then((d) => setPartner(d.partner ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function postMessage(payload: Record<string, unknown>) {
    await fetch(`/api/matches/${params.matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await load();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    await postMessage({ body: draft.trim() });
    setDraft('');
    setSending(false);
  }

  // "⚡ Vybe" -- the signature mechanic: post a fresh tap-to-answer
  // starter drawn from whatever these two people actually share. Tapping
  // one of its two options (rendered inline on the message bubble, see
  // the PROMPT case below) is just a normal postMessage with that
  // option's label as the body.
  async function sendVybeStarter() {
    if (busy) return;
    setBusy(true);
    const starter = pickStarter(shared, usedStarters);
    setUsedStarters((prev) => [...prev, starter.source]);
    await postMessage({ kind: 'PROMPT', meta: { question: starter.question, emoji: starter.emoji, options: starter.options } });
    setBusy(false);
  }

  async function answerPrompt(option: StarterOption) {
    if (busy) return;
    setBusy(true);
    await postMessage({ body: `${option.emoji} ${option.label}` });
    setBusy(false);
  }

  // "🎯 Ask about me" -- tapping one of the partner's interests/tribes
  // composes and sends the matching open-ended question as a normal text
  // message, so asking about something they picked never requires
  // inventing an opening line.
  async function askAbout(kind: 'interest' | 'tribe', key: string) {
    if (busy) return;
    const question = askQuestionFor(kind, key);
    if (!question) return;
    setBusy(true);
    await postMessage({ body: question });
    setPanel('none');
    setBusy(false);
  }

  async function proposePlan(vibeLabel: string) {
    if (!planActivity || busy) return;
    setBusy(true);
    await postMessage({ kind: 'PLAN', meta: { activity: planActivity, vibe: vibeLabel } });
    setPlanActivity(null);
    setPanel('none');
    setBusy(false);
  }

  async function noGhostClose() {
    await postMessage({ noGhostClose: true });
    router.push('/matches');
  }

  async function unmatch() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/matches/${params.matchId}/unmatch`, { method: 'POST' });
    router.push('/matches');
  }

  async function block() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/matches/${params.matchId}/block`, { method: 'POST' });
    router.push('/matches');
  }

  async function hideConversation() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/matches/${params.matchId}/hide`, { method: 'POST' });
    router.push('/matches');
  }

  async function submitReport() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/matches/${params.matchId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() }),
    });
    setBusy(false);
    setReportDetails('');
    setPanel('none');
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-3">
        <Link href="/matches" className="shrink-0 text-sm font-semibold text-inkSoft">
          ← Matches
        </Link>
        <button
          type="button"
          onClick={() => setPanel('profile')}
          className="flex min-w-0 flex-1 items-center justify-center gap-2"
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-xs font-bold text-white"
            style={{
              background: `linear-gradient(150deg, hsl(${partner?.avatarHue ?? 320}, 80%, 55%), hsl(${
                (partner?.avatarHue ?? 320) + 40
              }, 80%, 55%))`,
            }}
          >
            {partner?.avatarSeed ?? '·'}
          </span>
          <span className="truncate text-sm font-bold">{partner?.displayName ?? 'Loading…'}</span>
        </button>
        <button
          type="button"
          onClick={() => setPanel('menu')}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-inkSoft"
          aria-label="More options"
        >
          ⋯
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {vibe && (
          <div className="mb-2 rounded-2xl border border-line bg-gradient-to-br from-magenta/5 via-white to-marigold/5 p-4">
            <p className="text-center font-display text-2xl font-extrabold">🔥 {vibe.percent}% Vibe Match</p>
            {vibe.sharedWorldsCount > 0 && (
              <>
                <p className="mt-1 text-center text-sm font-semibold text-inkSoft">
                  You found {vibe.sharedWorldsCount} shared world{vibe.sharedWorldsCount > 1 ? 's' : ''} 🌎
                </p>
                <ul className="mt-2 text-center text-sm">
                  {vibe.sharedWorldLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {vibe.sharedInterests.length > 0 && (
              <div className="mt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  You both love
                </p>
                <p className="text-center text-sm">
                  {vibe.sharedInterests.map((i) => `${i.emoji} ${i.label}`).join(' · ')}
                </p>
              </div>
            )}
            {vibe.sharedTribes.length > 0 && (
              <div className="mt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  You might get along over
                </p>
                <p className="text-center text-sm">
                  {vibe.sharedTribes.map((t) => `${t.emoji} ${t.label}`).join(' · ')}
                </p>
              </div>
            )}
            {vibe.relationshipLines.length > 0 && (
              <div className="mt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  Your relationship styles
                </p>
                <ul className="mt-1 text-center text-sm">
                  {vibe.relationshipLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-inkSoft">You matched! Say something 👋</p>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === myUserId;
          const isLatest = i === messages.length - 1;

          if (m.kind === 'PROMPT' && m.meta && 'options' in m.meta) {
            const meta = m.meta;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-2xl border border-line bg-gradient-to-br from-marigold/10 to-magenta/10 px-4 py-3 text-sm">
                  <p className="font-semibold">
                    {meta.emoji} {meta.question}
                  </p>
                  {/* Only the newest prompt is still answerable -- once the
                      conversation has moved on, stale option buttons would
                      just be clutter. */}
                  {isLatest && (
                    <div className="mt-2 flex gap-2">
                      {meta.options.map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => answerPrompt(opt)}
                          disabled={busy}
                          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          {opt.emoji} {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (m.kind === 'PLAN' && m.meta && 'activity' in m.meta) {
            const meta = m.meta;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-2xl border border-line bg-paper px-4 py-3 text-center text-sm">
                  <p className="font-semibold">
                    ✨ {meta.activity.emoji} {meta.activity.label} · {meta.vibe} vibe
                  </p>
                  <p className="mt-0.5 text-xs text-inkSoft">Plan proposed — work out details below</p>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine ? 'gradient-btn text-white' : 'border border-line bg-white text-ink'
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* The signature mechanic plus the two other lightweight ways in --
          deliberately just 3 buttons, not a toolbar. */}
      <div className="flex gap-2 overflow-x-auto bg-white px-3 pt-2.5">
        <button
          type="button"
          onClick={sendVybeStarter}
          disabled={busy}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          ⚡ Vybe
        </button>
        <button
          type="button"
          onClick={() => setPanel('askAbout')}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
        >
          🎯 Ask about me
        </button>
        <button
          type="button"
          onClick={() => setPanel('plan')}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
        >
          ✨ Make a plan
        </button>
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-line bg-white p-3">
        <span aria-hidden className="text-lg">
          🙂
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send"
          className="gradient-btn grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold text-white disabled:opacity-60"
        >
          ➤
        </button>
      </form>

      {panel === 'profile' && partner && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => setPanel('none')}
        >
          <div
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-6 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-extrabold">Match Profile</p>
              <button type="button" onClick={() => setPanel('none')} className="text-sm font-semibold text-inkSoft">
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center text-center">
              <span
                className="grid h-16 w-16 place-items-center rounded-full font-display text-xl font-bold text-white"
                style={{
                  background: `linear-gradient(150deg, hsl(${partner.avatarHue}, 80%, 55%), hsl(${
                    partner.avatarHue + 40
                  }, 80%, 55%))`,
                }}
              >
                {partner.avatarSeed}
              </span>
              <p className="mt-2 font-display text-xl font-extrabold">
                {partner.displayName}, {partner.age}
              </p>
              <p className="text-sm text-inkSoft">{partner.city}</p>
              <div className="mt-2">
                <IntentBadge intent={partner.intent} />
              </div>
            </div>

            {(vibe?.sharedInterests.length || vibe?.sharedTribes.length) ? (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  ⚡ Your shared Vybe
                </p>
                <p className="mt-1 text-sm">
                  {[
                    ...vibe.sharedInterests.map((i) => `${i.emoji} ${i.label}`),
                    ...vibe.sharedTribes.map((t) => `${t.emoji} ${t.label}`),
                  ].join(' · ')}
                </p>
              </div>
            ) : null}

            {partner.tribes.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">🪩 Their tribe</p>
                <p className="mt-1 text-sm">{partner.tribes.map((t) => `${t.emoji} ${t.label}`).join(' · ')}</p>
              </div>
            )}

            {partner.relationshipStyles.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  💕 Relationship vibe
                </p>
                <p className="mt-1 text-sm">
                  {partner.relationshipStyles.map((r) => `${r.emoji} ${r.label}`).join(' · ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {panel === 'menu' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => setPanel('none')}
        >
          <div
            className="w-full max-w-sm rounded-t-card bg-white p-4 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Safety options: always reachable from here, never taking
                up space in the main chat chrome. */}
            <button
              type="button"
              onClick={noGhostClose}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold"
            >
              No-Ghost close
            </button>
            <button
              type="button"
              onClick={hideConversation}
              disabled={busy}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold disabled:opacity-60"
            >
              Hide conversation
            </button>
            <button
              type="button"
              onClick={() => setPanel('report')}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold"
            >
              Report
            </button>
            <button
              type="button"
              onClick={unmatch}
              disabled={busy}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-inkSoft disabled:opacity-60"
            >
              Unmatch
            </button>
            <button
              type="button"
              onClick={block}
              disabled={busy}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-magenta disabled:opacity-60"
            >
              Block
            </button>
            <button
              type="button"
              onClick={() => setPanel('none')}
              className="mt-2 block w-full rounded-xl border border-line px-4 py-3 text-center text-sm font-semibold text-inkSoft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === 'askAbout' && partner && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => setPanel('none')}
        >
          <div
            className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-extrabold">🎯 Ask about...</p>
            <p className="mt-1 text-sm text-inkSoft">Tap something of theirs to get a question about it.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {partner.interests.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => askAbout('interest', i.label)}
                  disabled={busy}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                >
                  {i.emoji} {i.label}
                </button>
              ))}
              {partner.tribes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => askAbout('tribe', t.slug)}
                  disabled={busy}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPanel('none')}
              className="mt-5 block w-full text-center text-sm font-semibold text-inkSoft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === 'plan' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => {
            setPanel('none');
            setPlanActivity(null);
          }}
        >
          <div
            className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            {!planActivity ? (
              <>
                <p className="font-display text-lg font-extrabold">✨ Make a plan</p>
                <p className="mt-1 text-sm text-inkSoft">What are you feeling?</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PLAN_ACTIVITIES.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => setPlanActivity(a)}
                      className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold"
                    >
                      {a.emoji} {a.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="font-display text-lg font-extrabold">Pick your vibe</p>
                <p className="mt-1 text-sm text-inkSoft">
                  {planActivity.emoji} {planActivity.label}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PLAN_VIBES.map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => proposePlan(v.label)}
                      disabled={busy}
                      className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                    >
                      {v.emoji} {v.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPlanActivity(null)}
                  className="mt-4 text-xs font-semibold text-inkSoft"
                >
                  ← Back
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setPanel('none');
                setPlanActivity(null);
              }}
              className="mt-5 block w-full text-center text-sm font-semibold text-inkSoft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel === 'report' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => setPanel('none')}
        >
          <div
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-extrabold">Report</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReportReason(r)}
                  className={`rounded-xl border px-4 py-2.5 text-left text-sm font-semibold ${
                    reportReason === r ? 'border-magenta bg-magenta/5' : 'border-line'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Any details that would help us review this (optional)"
              rows={3}
              className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPanel('none')}
                className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-inkSoft"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={busy}
                className="gradient-btn flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import IntentBadge from '@/components/IntentBadge';
import type { PairIntent, SignalItem } from '@/lib/matchSignals';
import {
  pickVybePrompt,
  getAskAboutTopics,
  getCasualPlanRecommendations,
  CASUAL_PLAN_ACTIVITIES,
  getPlanFlow,
  SAFETY_BEFORE_MEETING,
  VIDEO_VYBE_COPY,
  type AskTopic,
  type PlanOption,
  type PlanStep,
  type StarterOption,
} from '@/lib/vybeContent';

interface PromptMeta {
  question: string;
  emoji: string;
  options: [StarterOption, StarterOption];
  attribution?: string;
}
interface PlanMeta {
  activity: StarterOption;
  vibe?: string;
  steps?: Record<string, string>;
}

interface Message {
  id: string;
  senderId: string;
  body: string;
  kind: 'TEXT' | 'PROMPT' | 'PLAN' | 'VIDEO_VYBE';
  meta: PromptMeta | PlanMeta | Record<string, never> | null;
  createdAt: string;
  likes: { userId: string }[];
  replyTo: { id: string; body: string; senderId: string; kind: string } | null;
}

interface SignalsData {
  pairIntent: PairIntent;
  rankedSignals: SignalItem[];
  complementarySignals: SignalItem[];
  matchExplanation: { emoji: string; text: string }[] | null;
  noStrongSignalText: string;
  quickHelloMessages: string[];
  sharedInterestLabels: string[];
  sharedTribeSlugs: string[];
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
  valuesTags: { slug: string; label: string; emoji: string }[];
  futureVibe: { question: string; slug: string; label: string; emoji: string }[];
  children: { slug: string; label: string; emoji: string } | null;
  distance: string | null;
}

const REPORT_REASONS = ['Inappropriate messages', 'Fake profile', 'Harassment', 'Spam or scam', 'Other'] as const;

// A small curated emoji set for the composer's picker -- no external
// package (no network to install one in this environment), just enough
// variety for quick reactions/flourishes in a message.
const EMOJI_PICKER_SET = [
  '😀', '😂', '🥰', '😍', '😅', '😉', '😊', '😘',
  '😎', '🤔', '😏', '😭', '🙈', '🥺', '😴', '🤗',
  '👍', '🙌', '👏', '🙏', '💪', '✌️', '🤝', '👀',
  '❤️', '💛', '💚', '💙', '💜', '🔥', '✨', '💯',
  '🎉', '☕', '🍕', '🍜', '🎮', '🎵', '✈️', '🌙',
];

// MVP heuristics for progressive unlocking -- no real "engagement" signal
// exists yet, so message counts stand in for it (see the post-match
// spec's "progressive feature unlocking" section). Documented here so a
// future pass can swap these for something smarter without hunting.
const PLAN_UNLOCK_AFTER_EXCHANGE = true; // both sides must have sent >=1 message
const KEEP_VYBE_GOING_MESSAGE_COUNT = 8;
const READY_TO_MEET_MESSAGE_COUNT = 16;

export default function ChatPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [signals, setSignals] = useState<SignalsData | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [usedVybeSources, setUsedVybeSources] = useState<string[]>([]);
  const [sharedVybeOpen, setSharedVybeOpen] = useState(false);
  const [revealDifference, setRevealDifference] = useState(false);
  const [dateFeedbackSubmitted, setDateFeedbackSubmitted] = useState<boolean | null>(null);
  const [keepGoingDismissed, setKeepGoingDismissed] = useState(false);
  const [readyOfflineDismissed, setReadyOfflineDismissed] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Every overlay this screen can show, one at a time -- keeps "keep the
  // post-match experience simple" true here too: nothing stacks on top of
  // anything else.
  const [panel, setPanel] = useState<
    'none' | 'menu' | 'profile' | 'askAbout' | 'plan' | 'report' | 'safety' | 'dateFeedback'
  >('none');
  const [planStepIndex, setPlanStepIndex] = useState(0);
  const [planAnswers, setPlanAnswers] = useState<Record<string, PlanOption>>({});
  const [planSafetyAcked, setPlanSafetyAcked] = useState(false);
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
    // The signal engine's output doesn't change between two people's
    // fixed picks, so this is fetched once — no reason to put it on the
    // 4s message poll (see lib/matchSignals.ts + app/api/matches/[matchId]/vibe/route.ts).
    fetch(`/api/matches/${params.matchId}/vibe`)
      .then((r) => r.json())
      .then((d) =>
        setSignals({
          pairIntent: d.pairIntent,
          rankedSignals: d.rankedSignals ?? [],
          complementarySignals: d.complementarySignals ?? [],
          matchExplanation: d.matchExplanation ?? null,
          noStrongSignalText: d.noStrongSignalText ?? "You both liked each other. That's a pretty good start. 💚",
          quickHelloMessages: d.quickHelloMessages ?? [],
          sharedInterestLabels: d.sharedInterestLabels ?? [],
          sharedTribeSlugs: d.sharedTribeSlugs ?? [],
        })
      );
    fetch(`/api/matches/${params.matchId}/partner`)
      .then((r) => r.json())
      .then((d) => {
        setPartner(d.partner ?? null);
        setIsMuted(Boolean(d.matchMeta?.isMuted));
      });
    fetch(`/api/matches/${params.matchId}/date-feedback`)
      .then((r) => r.json())
      .then((d) => setDateFeedbackSubmitted(Boolean(d.submitted)))
      .catch(() => setDateFeedbackSubmitted(false));
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
    // Only the plain-text composer attaches replyToId -- other actions
    // (Vybe, Ask about me, Plan, ...) never quote a message, even if a
    // reply happened to be staged when one of those was tapped.
    await postMessage(replyingTo ? { body: draft.trim(), replyToId: replyingTo.id } : { body: draft.trim() });
    setDraft('');
    setReplyingTo(null);
    setSending(false);
  }

  // Swipe-to-reply's simplified tap equivalent: a small "reply" action on
  // any bubble quotes it above the composer until the next message sends
  // (or the reply is cancelled). Liking is a straight toggle -- see
  // app/api/matches/[matchId]/messages/[messageId]/like/route.ts.
  async function toggleLike(messageId: string) {
    if (busy) return;
    await fetch(`/api/matches/${params.matchId}/messages/${messageId}/like`, { method: 'POST' });
    await load();
  }

  // "⚡ Vybe" -- the signature mechanic: post a fresh tap-to-answer
  // starter, always preferring the strongest unused *shared signal* over
  // the generic pool, and always attributed ("You both picked Travel") --
  // see lib/vybeContent.ts's pickVybePrompt.
  async function sendVybeStarter() {
    if (busy || !signals) return;
    setBusy(true);
    const prompt = pickVybePrompt(signals.pairIntent, signals.rankedSignals, usedVybeSources);
    setUsedVybeSources((prev) => [...prev, prompt.source]);
    await postMessage({
      kind: 'PROMPT',
      meta: { question: prompt.question, emoji: prompt.emoji, options: prompt.options, attribution: prompt.attribution },
    });
    setBusy(false);
  }

  async function answerPrompt(option: StarterOption) {
    if (busy) return;
    setBusy(true);
    await postMessage({ body: `${option.emoji} ${option.label}` });
    setBusy(false);
  }

  // "🎯 Ask about me" -- tapping a topic composes and sends the matching
  // open-ended question as a normal text message, so asking about
  // something never requires inventing an opening line. Casual stays
  // profile-driven; Relationship/Marriage use the fixed life-topic set
  // (see lib/vybeContent.ts's getAskAboutTopics).
  async function askAbout(topic: AskTopic) {
    if (busy) return;
    setBusy(true);
    await postMessage({ body: topic.question });
    setPanel('none');
    setBusy(false);
  }

  async function sendQuickHello(text: string) {
    if (busy) return;
    setBusy(true);
    await postMessage({ body: text });
    setBusy(false);
  }

  // Make a plan -- Casual stays single-step (a themed recommendation
  // straight away, only from what these two actually share); Relationship
  // / Marriage are short wizards ending in a safety interstitial before
  // the plan actually posts. See lib/vybeContent.ts's getPlanFlow /
  // getCasualPlanRecommendations for why these are three distinct flows.
  const planFlow: PlanStep[] = signals && signals.pairIntent !== 'JUST_VIBING' ? getPlanFlow(signals.pairIntent) : [];
  const casualPlanRecs = signals ? getCasualPlanRecommendations(signals.rankedSignals) : [];

  function resetPlanWizard() {
    setPlanStepIndex(0);
    setPlanAnswers({});
    setPlanSafetyAcked(false);
  }

  function pickPlanOption(stepId: string, option: PlanOption) {
    setPlanAnswers((prev) => ({ ...prev, [stepId]: option }));
    // Always advance -- once the index reaches planFlow.length the panel's
    // render check (`planStepIndex < planFlow.length`) naturally falls
    // through to the safety interstitial next. (Previously this only
    // advanced when another step remained, which left the wizard stuck
    // showing the *last* step forever -- e.g. tapping a "time of day"
    // option looked like it did nothing.)
    setPlanStepIndex((i) => i + 1);
  }

  async function proposeCasualPlan(activity: PlanOption) {
    if (busy) return;
    setBusy(true);
    await postMessage({ kind: 'PLAN', meta: { activity } });
    setPanel('none');
    setBusy(false);
  }

  async function proposeWizardPlan() {
    if (busy || planFlow.length === 0) return;
    setBusy(true);
    const activity = planAnswers['activity'] ?? planAnswers[planFlow[0]!.stepId];
    const steps: Record<string, string> = {};
    for (const [stepId, opt] of Object.entries(planAnswers)) {
      if (stepId !== 'activity') steps[stepId] = `${opt.emoji} ${opt.label}`;
    }
    await postMessage({ kind: 'PLAN', meta: { activity, steps } });
    resetPlanWizard();
    setPanel('none');
    setBusy(false);
  }

  async function respondToPlan(label: string) {
    if (busy) return;
    setBusy(true);
    await postMessage({ body: label });
    setBusy(false);
  }

  async function toggleMute() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/matches/${params.matchId}/mute`, { method: 'POST' }).then((r) => r.json());
    setIsMuted(Boolean(res.isMuted));
    setBusy(false);
  }

  async function deleteConversation() {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/matches/${params.matchId}/delete`, { method: 'POST' });
    router.push('/matches');
  }

  async function submitDateFeedback(rating: 'MEET_AGAIN' | 'MAYBE' | 'NOT_FOR_ME') {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/matches/${params.matchId}/date-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    setDateFeedbackSubmitted(true);
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

  const hasExchanged = messages.some((m) => m.senderId === myUserId) && messages.some((m) => m.senderId === partner?.userId);
  const planUnlocked = PLAN_UNLOCK_AFTER_EXCHANGE ? hasExchanged : true;
  const hasPlanMessage = messages.some((m) => m.kind === 'PLAN');
  const unusedSignalForNudge = signals?.rankedSignals.find((s) => !usedVybeSources.includes(s.sourceKey));
  const showKeepGoingNudge =
    !keepGoingDismissed && messages.length >= KEEP_VYBE_GOING_MESSAGE_COUNT && messages.length % KEEP_VYBE_GOING_MESSAGE_COUNT < 2 && Boolean(unusedSignalForNudge);
  const showReadyOfflineNudge =
    !readyOfflineDismissed && hasExchanged && !hasPlanMessage && messages.length >= READY_TO_MEET_MESSAGE_COUNT;
  const showDateFeedbackCard = hasPlanMessage && dateFeedbackSubmitted === false;

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
          <span className="truncate text-sm font-bold">
            {partner?.displayName ?? 'Loading…'}
            {isMuted && <span className="ml-1 text-xs text-inkSoft">🔕</span>}
          </span>
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
        {/* "⚡ Shared Vybe" -- an expandable tab, not a permanent block
            eating chat space: ranked natural-language signals plus, on
            tap, one interesting difference to talk through (see the
            spec's "one interesting difference" mechanic). */}
        {signals && (
          <div className="mb-2 rounded-2xl border border-line bg-gradient-to-br from-magenta/5 via-white to-marigold/5 p-4">
            <button
              type="button"
              onClick={() => setSharedVybeOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="font-display text-sm font-extrabold">⚡ Shared Vybe</span>
              <span className="text-xs font-semibold text-inkSoft">{sharedVybeOpen ? 'Hide' : 'Show'}</span>
            </button>
            {sharedVybeOpen && (
              <div className="mt-3">
                {signals.matchExplanation && signals.matchExplanation.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {signals.matchExplanation.map((line, i) => (
                      <li key={i} className="text-sm font-medium">
                        <span aria-hidden>{line.emoji}</span> {line.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm font-medium">{signals.noStrongSignalText}</p>
                )}
                {signals.complementarySignals.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    {!revealDifference ? (
                      <button
                        type="button"
                        onClick={() => setRevealDifference(true)}
                        className="text-xs font-semibold text-magenta underline"
                      >
                        🤔 You two see one thing differently — tap to see
                      </button>
                    ) : (
                      <p className="text-sm">{signals.complementarySignals[0]!.attribution}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* "Keep the Vybe going?" -- a periodic, dismissible nudge
            surfacing an unused shared topic once the chat's gone quiet on
            new ground. */}
        {showKeepGoingNudge && unusedSignalForNudge && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-4 py-2.5">
            <p className="text-xs font-semibold">
              Keep the Vybe going? You could ask about {unusedSignalForNudge.emoji} {unusedSignalForNudge.label}
            </p>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={sendVybeStarter} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">
                ⚡
              </button>
              <button
                type="button"
                onClick={() => setKeepGoingDismissed(true)}
                className="rounded-full px-2 py-1 text-xs text-inkSoft"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* "Ready to take it offline?" -- surfaced after real back-and-forth
            with no plan proposed yet. */}
        {showReadyOfflineNudge && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-4 py-2.5">
            <p className="text-xs font-semibold">Ready to take it offline? Maybe it&apos;s time to make a plan ✨</p>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => {
                  resetPlanWizard();
                  setPanel('plan');
                }}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-bold"
              >
                ✨
              </button>
              <button
                type="button"
                onClick={() => setReadyOfflineDismissed(true)}
                className="rounded-full px-2 py-1 text-xs text-inkSoft"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm text-inkSoft">You matched! Say something 👋</p>
            {signals && signals.quickHelloMessages.length > 0 && (
              <div className="mx-auto mt-3 flex max-w-xs flex-col gap-1.5">
                {signals.quickHelloMessages.slice(0, 3).map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => sendQuickHello(msg)}
                    disabled={busy}
                    className="rounded-xl border border-line bg-white px-4 py-2 text-left text-sm disabled:opacity-60"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === myUserId;
          const isLatest = i === messages.length - 1;

          if (m.kind === 'PROMPT' && m.meta && 'options' in m.meta) {
            const meta = m.meta;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-2xl border border-line bg-gradient-to-br from-marigold/10 to-magenta/10 px-4 py-3 text-sm">
                  {meta.attribution && <p className="text-[11px] font-semibold text-inkSoft">{meta.attribution}</p>}
                  <p className="font-semibold">
                    {meta.emoji} {meta.question}
                  </p>
                  {/* Only the recipient answers their own Vybe prompt
                      (not the person who proposed it), and only while it's
                      still the newest message -- once the conversation has
                      moved on, stale option buttons would just be clutter. */}
                  {isLatest && !mine && (
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
            const stepLines = meta.steps ? Object.values(meta.steps) : [];
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-2xl border border-line bg-paper px-4 py-3 text-center text-sm">
                  <p className="font-semibold">
                    ✨ {meta.activity.emoji} {meta.activity.label}
                    {meta.vibe ? ` · ${meta.vibe} vibe` : ''}
                  </p>
                  {stepLines.length > 0 && <p className="mt-1 text-xs text-inkSoft">{stepLines.join(' · ')}</p>}
                  <p className="mt-0.5 text-xs text-inkSoft">Plan proposed — work out details below</p>
                  {/* Response taps -- same mechanic as a PROMPT answer: just
                      sends a normal TEXT reply, no dedicated "plan status". */}
                  {isLatest && !mine && (
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      {['💚 I\'m in', '💬 Let\'s change it', '🕐 Different time', '📍 Different place', 'Maybe later'].map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => respondToPlan(label)}
                          disabled={busy}
                          className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (m.kind === 'VIDEO_VYBE') {
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-2xl border border-line bg-paper px-4 py-3 text-center text-sm">
                  <p className="font-semibold">{VIDEO_VYBE_COPY.title}</p>
                  <p className="mt-0.5 text-xs text-inkSoft">{VIDEO_VYBE_COPY.subtitle}</p>
                  {isLatest && !mine && (
                    <div className="mt-2 flex justify-center gap-1.5">
                      {VIDEO_VYBE_COPY.options.map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => respondToPlan(`${opt.emoji} ${opt.label}`)}
                          disabled={busy}
                          className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
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

          const iLikedThis = m.likes.some((l) => l.userId === myUserId);
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {/* Quoted preview when this message is a reply -- see the
                  reply/like row below for how it got tagged. */}
              {m.replyTo && (
                <div className="mb-1 max-w-[75%] truncate rounded-lg border-l-2 border-magenta/40 bg-paper px-2 py-1 text-xs text-inkSoft">
                  ↩ {m.replyTo.body}
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine ? 'gradient-btn text-white' : 'border border-line bg-white text-ink'
                }`}
              >
                {m.body}
              </div>
              <div className={`mt-0.5 flex items-center gap-2 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
                <button type="button" onClick={() => setReplyingTo(m)} className="text-[11px] font-semibold text-inkSoft">
                  ↩ Reply
                </button>
                <button type="button" onClick={() => toggleLike(m.id)} className="text-[11px] font-semibold text-inkSoft">
                  {iLikedThis ? '❤️' : '🤍'}
                  {m.likes.length > 0 ? ` ${m.likes.length}` : ''}
                </button>
              </div>
            </div>
          );
        })}

        {/* Private, own-eyes-only post-date check-in -- only once a plan
            has actually been proposed, and only until submitted once. */}
        {showDateFeedbackCard && (
          <div className="mt-2 rounded-2xl border border-line bg-paper p-4 text-center">
            <p className="text-sm font-semibold">How did the Vybe feel? (Just for you — never shared)</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <button
                type="button"
                onClick={() => submitDateFeedback('MEET_AGAIN')}
                disabled={busy}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                😊 Would meet again
              </button>
              <button
                type="button"
                onClick={() => submitDateFeedback('MAYBE')}
                disabled={busy}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                🤔 Not sure yet
              </button>
              <button
                type="button"
                onClick={() => submitDateFeedback('NOT_FOR_ME')}
                disabled={busy}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                💭 Not for me
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Vybe / Ask about me are always available; Make a plan unlocks
          after both sides have actually exchanged a message, and Video
          Vybe unlocks further in (see the MVP heuristics above). */}
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
        {planUnlocked && (
          <button
            type="button"
            onClick={() => {
              resetPlanWizard();
              setPanel('plan');
            }}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
          >
            ✨ Make a plan
          </button>
        )}
      </div>

      {replyingTo && (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-paper px-3 py-1.5">
          <p className="truncate text-xs text-inkSoft">
            ↩ Replying to: <span className="font-semibold">{replyingTo.body}</span>
          </p>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="shrink-0 text-xs font-bold text-inkSoft"
          >
            ✕
          </button>
        </div>
      )}
      {emojiPickerOpen && (
        <div className="border-t border-line bg-white px-3 py-2">
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_PICKER_SET.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setDraft((d) => d + e)}
                className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-paper"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-line bg-white p-3">
        <button
          type="button"
          onClick={() => setEmojiPickerOpen((v) => !v)}
          aria-label="Emoji picker"
          className="shrink-0 text-lg"
        >
          🙂
        </button>
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
              <p className="text-sm text-inkSoft">
                {partner.city}
                {partner.distance ? ` · ${partner.distance}` : ''}
              </p>
              <div className="mt-2">
                <IntentBadge intent={partner.intent} />
              </div>
            </div>

            {signals && (signals.sharedInterestLabels.length > 0 || signals.sharedTribeSlugs.length > 0) && (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  ⚡ Your shared Vybe
                </p>
                <p className="mt-1 text-sm">
                  {[...signals.sharedInterestLabels, ...signals.sharedTribeSlugs].join(' · ')}
                </p>
              </div>
            )}

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

            {/* Rishta Ready only -- see the post-match spec's extended
                Match Profile sections for marriage matches. */}
            {partner.valuesTags.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  🧭 What matters to {partner.displayName}
                </p>
                <p className="mt-1 text-sm">{partner.valuesTags.map((v) => `${v.emoji} ${v.label}`).join(' · ')}</p>
              </div>
            )}
            {(partner.futureVibe.length > 0 || partner.children) && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">🏡 Future vibe</p>
                <p className="mt-1 text-sm">
                  {[...partner.futureVibe.map((v) => `${v.emoji} ${v.label}`), partner.children ? `${partner.children.emoji} ${partner.children.label}` : null]
                    .filter(Boolean)
                    .join(' · ')}
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
              onClick={() => setPanel('safety')}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold"
            >
              🛡️ Safety
            </button>
            <button
              type="button"
              onClick={toggleMute}
              disabled={busy}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold disabled:opacity-60"
            >
              {isMuted ? '🔔 Unmute' : '🔕 Mute'}
            </button>
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
              onClick={deleteConversation}
              disabled={busy}
              className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold disabled:opacity-60"
            >
              Delete conversation
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

      {panel === 'safety' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => setPanel('none')}
        >
          <div
            className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-extrabold">🛡️ Safety</p>
            <p className="mt-1 text-sm text-inkSoft">A few reminders before meeting someone new.</p>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              <li className="rounded-xl bg-paper p-3">📍 Meet in a public place, especially the first time.</li>
              <li className="rounded-xl bg-paper p-3">
                👥 Share your date details (who, where, when) with someone you trust.
              </li>
              <li className="rounded-xl bg-paper p-3">📹 Consider a quick video Vybe before meeting in person.</li>
              <li className="rounded-xl bg-paper p-3">🚗 Arrange your own way there and back.</li>
            </ul>
            <button
              type="button"
              onClick={() => setPanel('none')}
              className="mt-5 block w-full text-center text-sm font-semibold text-inkSoft"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {panel === 'askAbout' && partner && signals && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => setPanel('none')}
        >
          <div
            className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-extrabold">🎯 Ask about...</p>
            <p className="mt-1 text-sm text-inkSoft">Tap a topic to send the question straight away.</p>
            <div className="mt-4 flex flex-col gap-1.5">
              {getAskAboutTopics(signals.pairIntent, partner.interests, partner.tribes, signals.rankedSignals).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => askAbout(t)}
                  disabled={busy}
                  className="rounded-xl border border-line px-4 py-2 text-left text-sm disabled:opacity-60"
                >
                  <span aria-hidden>{t.emoji}</span> {t.question}
                  {t.attribution && <span className="ml-1 text-xs text-inkSoft">· {t.attribution}</span>}
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

      {panel === 'plan' && signals && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onClick={() => {
            setPanel('none');
            resetPlanWizard();
          }}
        >
          <div
            className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Casual: single-step, straight to recommendations drawn
                only from interests these two actually share -- never
                recommending something neither of them picked. */}
            {signals.pairIntent === 'JUST_VIBING' ? (
              <>
                <p className="font-display text-lg font-extrabold">✨ Make a plan</p>
                {casualPlanRecs.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                      Based on what you both like
                    </p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {casualPlanRecs.map((rec) => (
                        <div key={rec.key} className="rounded-xl border border-line p-3">
                          <p className="text-sm font-semibold">
                            {rec.emoji} {rec.label} · {rec.why}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {rec.options.map((opt) => (
                              <button
                                key={opt.label}
                                type="button"
                                onClick={() => proposeCasualPlan(opt)}
                                disabled={busy}
                                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                              >
                                {opt.emoji} {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">Or pick anything</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CASUAL_PLAN_ACTIVITIES.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => proposeCasualPlan(a)}
                        disabled={busy}
                        className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                      >
                        {a.emoji} {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : planStepIndex < planFlow.length ? (
              /* Relationship / Marriage: short multi-step wizard. */
              <>
                <p className="font-display text-lg font-extrabold">✨ Make a plan</p>
                <p className="mt-1 text-sm text-inkSoft">{planFlow[planStepIndex]!.prompt}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {planFlow[planStepIndex]!.options.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => pickPlanOption(planFlow[planStepIndex]!.stepId, opt)}
                      className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold"
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
                {planStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setPlanStepIndex((i) => Math.max(0, i - 1))}
                    className="mt-4 text-xs font-semibold text-inkSoft"
                  >
                    ← Back
                  </button>
                )}
              </>
            ) : !planSafetyAcked ? (
              /* Pre-meeting safety interstitial -- shown once, right
                 before the plan actually posts. */
              <>
                <p className="font-display text-lg font-extrabold">{SAFETY_BEFORE_MEETING.title}</p>
                <p className="mt-2 text-sm text-inkSoft">{SAFETY_BEFORE_MEETING.body}</p>
                <button
                  type="button"
                  onClick={() => setPlanSafetyAcked(true)}
                  className="gradient-btn mt-5 w-full rounded-full px-4 py-2.5 text-sm font-bold text-white"
                >
                  {SAFETY_BEFORE_MEETING.cta}
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-lg font-extrabold">Ready to send?</p>
                <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
                  {Object.entries(planAnswers).map(([stepId, opt]) => (
                    <p key={stepId}>
                      {opt.emoji} {opt.label}
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={proposeWizardPlan}
                  disabled={busy}
                  className="gradient-btn mt-5 w-full rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  Send plan
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setPanel('none');
                resetPlanWizard();
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

'use client';

import { useState } from 'react';
import IntentBadge from './IntentBadge';

export interface FeedProfile {
  userId: string;
  displayName: string;
  city: string;
  intent: string;
  bio: string;
  avatarSeed: string;
  avatarHue: number;
  verification: string;
  interests: { id: string; label: string; emoji: string }[];
  prompts: { id: string; text: string; emoji: string; answer: string }[];
  matchScore: number;
  matchReasons: string[];
}

const HUE_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(150deg,#FF7A29 0%,#E8367B 55%,#6C4FD1 100%)',
  2: 'linear-gradient(150deg,#0FB88A 0%,#2A9DD6 55%,#6C4FD1 100%)',
  3: 'linear-gradient(150deg,#F2559A 0%,#FF7A29 55%,#FFC24B 100%)',
  4: 'linear-gradient(150deg,#6C4FD1 0%,#E8367B 55%,#FF7A29 100%)',
  5: 'linear-gradient(150deg,#2A9DD6 0%,#0FB88A 55%,#C9E265 100%)',
  6: 'linear-gradient(150deg,#FFC24B 0%,#FF7A29 55%,#E8367B 100%)',
};

export default function VibeCard({
  profile,
  onSwipe,
}: {
  profile: FeedProfile;
  onSwipe: (action: 'PASS' | 'PANGA') => void;
}) {
  const revealTargets = profile.prompts.length > 0 ? profile.prompts : profile.interests;
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const total = revealTargets.length || 1;
  const pct = Math.round((revealed.size / total) * 100);
  const blur = 20 - 20 * (revealed.size / total);

  function reveal(id: string) {
    setRevealed((prev) => new Set(prev).add(id));
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <div
        className="relative aspect-[3/4] overflow-hidden rounded-card shadow-lg"
        style={{ background: HUE_GRADIENTS[profile.avatarHue] ?? HUE_GRADIENTS[1] }}
      >
        <div className="absolute left-3 right-3 top-3 h-1.5 overflow-hidden rounded-full bg-white/30">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.max(pct, 6)}%` }} />
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center transition-[filter] duration-500"
          style={{ filter: `blur(${blur}px) saturate(.9)` }}
        >
          <span className="font-display text-8xl font-extrabold text-white/90">{profile.avatarSeed}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl font-bold">{profile.displayName}</h3>
            <span className="text-xs opacity-80">· {profile.city}</span>
            {profile.verification === 'VERIFIED' && (
              <span title="ID verified" className="text-sm">
                ✅
              </span>
            )}
          </div>
          <IntentBadge intent={profile.intent} className="mt-1.5 bg-white/20 text-white" />
          {profile.bio && <p className="mt-2 text-sm opacity-90">{profile.bio}</p>}
          {profile.matchReasons.length > 0 && (
            <p className="mt-2 text-[11px] uppercase tracking-wide opacity-75">
              Why you might click: {profile.matchReasons.join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {revealTargets.length === 0 && (
          <p className="text-center text-xs text-inkSoft">No prompts yet — swipe to move on.</p>
        )}
        {profile.prompts.length > 0
          ? profile.prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => reveal(p.id)}
                disabled={revealed.has(p.id)}
                className={`rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition ${
                  revealed.has(p.id) ? 'border-mint text-mint' : 'border-line bg-white text-ink'
                }`}
              >
                {revealed.has(p.id) ? `✓ ${p.emoji} ${p.text} — "${p.answer}"` : `${p.emoji} ${p.text}`}
              </button>
            ))
          : profile.interests.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => reveal(i.id)}
                disabled={revealed.has(i.id)}
                className={`rounded-2xl border px-3 py-2.5 text-left text-sm font-medium transition ${
                  revealed.has(i.id) ? 'border-mint text-mint' : 'border-line bg-white text-ink'
                }`}
              >
                {revealed.has(i.id) ? `✓ ${i.emoji} into ${i.label}` : `${i.emoji} into ${i.label}?`}
              </button>
            ))}
      </div>

      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => onSwipe('PASS')}
          className="grid h-14 w-14 place-items-center rounded-full border border-line bg-white text-xl shadow"
          aria-label="Pass"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => onSwipe('PANGA')}
          className="grid h-14 w-14 place-items-center rounded-full border border-mint bg-white text-xl text-mint shadow"
          aria-label="Panga"
        >
          ✓
        </button>
      </div>
    </div>
  );
}

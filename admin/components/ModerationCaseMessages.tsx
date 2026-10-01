'use client';

import { useState } from 'react';
import Badge from '@/components/Badge';

type MessageRow = {
  id: string;
  senderId: string;
  body: string;
  kind: 'TEXT' | 'PROMPT' | 'PLAN' | 'VIDEO_VYBE';
  status: 'SENT' | 'DELIVERED' | 'READ';
  createdAt: string;
  meta: unknown;
};

type MatchInfo = {
  id: string;
  createdAt: string;
  unmatchedAt: string | null;
  reporterId: string;
  subjectUserId: string;
};

type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'empty'; reason: string }
  | { phase: 'loaded'; match: MatchInfo; messages: MessageRow[] };

// "View reported conversation" -- the Privacy Policy says a safety report
// can trigger a message review; this is that review, scoped to exactly
// the match between the reporter and the reported user on this case. Pull,
// not preload: see the API route (api/moderation/cases/[caseId]/messages)
// for why this fetches on demand rather than loading with the page.
export default function ModerationCaseMessages({ caseId, subjectUserId, reporterName }: { caseId: string; subjectUserId: string; reporterName: string }) {
  const [state, setState] = useState<LoadState>({ phase: 'idle' });

  async function load() {
    setState({ phase: 'loading' });
    try {
      const res = await fetch(`/api/moderation/cases/${caseId}/messages`);
      const data = await res.json();
      if (!res.ok) {
        setState({ phase: 'error', message: data.error || 'Could not load the conversation.' });
        return;
      }
      if (!data.match) {
        setState({ phase: 'empty', reason: data.reason || 'No conversation found.' });
        return;
      }
      setState({ phase: 'loaded', match: data.match, messages: data.messages });
    } catch {
      setState({ phase: 'error', message: 'Could not load the conversation.' });
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Reported conversation</h2>
        {state.phase === 'idle' && (
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas"
          >
            View reported conversation
          </button>
        )}
      </div>

      {state.phase === 'idle' && (
        <p className="text-xs text-inkFaint">
          Pulls the message history between {reporterName} and the reported user. Viewing it is logged to the audit log.
        </p>
      )}
      {state.phase === 'loading' && <p className="text-sm text-inkFaint">Loading…</p>}
      {state.phase === 'error' && <p className="text-sm text-critical">{state.message}</p>}
      {state.phase === 'empty' && <p className="text-sm text-inkFaint">{state.reason}</p>}

      {state.phase === 'loaded' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-inkFaint">
            <span>{state.messages.length} message{state.messages.length === 1 ? '' : 's'}</span>
            <span>· matched {new Date(state.match.createdAt).toISOString().slice(0, 10)}</span>
            {state.match.unmatchedAt && <Badge tone="default">Unmatched</Badge>}
          </div>
          {state.messages.length === 0 ? (
            <p className="text-sm text-inkFaint">This match has no messages.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {state.messages.map((m) => {
                const fromSubject = m.senderId === subjectUserId;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-lg p-2.5 text-sm ${fromSubject ? 'ml-auto bg-criticalSoft text-ink' : 'bg-canvas text-ink'}`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-1 text-[11px] text-inkFaint">
                      {fromSubject ? 'Reported user' : 'Reporter'} · {m.kind !== 'TEXT' ? `${m.kind} · ` : ''}
                      {new Date(m.createdAt).toISOString().slice(0, 16).replace('T', ' ')}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

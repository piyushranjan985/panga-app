'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRole, ModerationCaseStatus } from '@prisma/client';
import { hasPermission } from '@/lib/rbac';
import ConfirmActionButton from '@/components/ConfirmActionButton';

interface Props {
  caseId: string;
  role: AdminRole;
  status: ModerationCaseStatus;
  currentAssigneeId: string | null;
  admins: { id: string; name: string }[];
  hasAppeal: boolean;
}

export default function ModerationCaseActions({ caseId, role, status, currentAssigneeId, admins, hasAppeal }: Props) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(currentAssigneeId ?? '');
  const [assigning, setAssigning] = useState(false);
  const canAssign = hasPermission(role, 'moderation.assign');
  const canResolve = hasPermission(role, 'moderation.resolve');
  const canReviewAppeal = hasPermission(role, 'moderation.appeals.review');

  async function assign() {
    setAssigning(true);
    try {
      await fetch(`/api/moderation/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigneeId: assignee || null }),
      });
      router.refresh();
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-4">
      {canAssign && (
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold">Assignment</h2>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button onClick={assign} disabled={assigning} className="mt-2 w-full rounded-lg border border-border py-1.5 text-sm font-semibold text-inkSoft">
            {assigning ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      )}

      {canResolve && status !== 'RESOLVED' && status !== 'DISMISSED' && (
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold">Resolve</h2>
          <div className="space-y-2">
            <ConfirmActionButton
              label="Escalate"
              confirmTitle="Escalate this case"
              endpoint={`/api/moderation/cases/${caseId}`}
              method="PATCH"
              requireReason={false}
              extraBody={{ status: 'ESCALATED' }}
            />
            <ConfirmActionButton
              label="Resolve (action taken)"
              confirmTitle="Resolve this case"
              confirmDescription="Describe what enforcement action was taken (or link the User Actions used)."
              endpoint={`/api/moderation/cases/${caseId}/resolve`}
              extraBody={{ outcome: 'RESOLVED' }}
            />
            <ConfirmActionButton
              label="Dismiss (no violation)"
              confirmTitle="Dismiss this case"
              endpoint={`/api/moderation/cases/${caseId}/resolve`}
              extraBody={{ outcome: 'DISMISSED' }}
            />
          </div>
        </div>
      )}

      {hasAppeal && canReviewAppeal && (
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold">Appeal</h2>
          <div className="space-y-2">
            <ConfirmActionButton
              label="Uphold original decision"
              confirmTitle="Uphold the enforcement decision"
              endpoint={`/api/moderation/cases/${caseId}/appeal`}
              extraBody={{ outcome: 'UPHELD' }}
            />
            <ConfirmActionButton
              label="Overturn"
              confirmTitle="Overturn the enforcement decision"
              endpoint={`/api/moderation/cases/${caseId}/appeal`}
              extraBody={{ outcome: 'OVERTURNED' }}
              tone="critical"
            />
          </div>
        </div>
      )}
    </div>
  );
}

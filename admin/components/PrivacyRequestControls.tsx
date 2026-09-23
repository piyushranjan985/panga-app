'use client';

import type { PrivacyRequestStatus, PrivacyRequestType } from '@prisma/client';
import ConfirmActionButton from '@/components/ConfirmActionButton';

export default function PrivacyRequestControls({
  requestId,
  status,
  type,
  hasActiveLegalHold,
  canExport,
}: {
  requestId: string;
  status: PrivacyRequestStatus;
  type: PrivacyRequestType;
  hasActiveLegalHold: boolean;
  canExport: boolean;
}) {
  const endpoint = `/api/privacy/requests/${requestId}`;
  const closed = status === 'COMPLETED' || status === 'REJECTED';

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-5">
      <h2 className="text-sm font-bold">Actions</h2>

      {canExport && (
        <a
          href={`/api/privacy/requests/${requestId}/export`}
          className="block rounded-lg border border-border px-3 py-1.5 text-center text-xs font-semibold text-inkSoft hover:bg-canvas"
        >
          Download data export (JSON)
        </a>
      )}

      {!closed && (
        <>
          {status === 'RECEIVED' && (
            <ConfirmActionButton
              label="Start identity verification"
              confirmTitle="Move to identity verification"
              endpoint={endpoint}
              method="PATCH"
              requireReason={false}
              extraBody={{ status: 'VERIFYING_IDENTITY' }}
            />
          )}
          {(status === 'RECEIVED' || status === 'VERIFYING_IDENTITY') && (
            <ConfirmActionButton
              label="Mark in progress"
              confirmTitle="Start working this request"
              endpoint={endpoint}
              method="PATCH"
              requireReason={false}
              extraBody={{ status: 'IN_PROGRESS' }}
            />
          )}
          <ConfirmActionButton
            label={type === 'DELETION' ? 'Complete (erase account)' : 'Complete'}
            confirmTitle={type === 'DELETION' ? 'Complete this deletion request' : 'Mark this request complete'}
            confirmDescription={
              type === 'DELETION'
                ? hasActiveLegalHold
                  ? 'Blocked -- an active legal hold must be released first.'
                  : 'This anonymizes the account (same effect as a User Action delete), and cannot be undone.'
                : undefined
            }
            endpoint={endpoint}
            method="PATCH"
            extraBody={{ status: 'COMPLETED' }}
            tone={type === 'DELETION' ? 'critical' : 'default'}
            requireStepUp
          />
          <ConfirmActionButton label="Reject" confirmTitle="Reject this request" endpoint={endpoint} method="PATCH" extraBody={{ status: 'REJECTED' }} />
        </>
      )}
    </div>
  );
}

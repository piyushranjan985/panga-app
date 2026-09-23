'use client';

import type { PrivacyIncidentStatus } from '@prisma/client';
import ConfirmActionButton from '@/components/ConfirmActionButton';

const NEXT_STATUS: Record<PrivacyIncidentStatus, PrivacyIncidentStatus[]> = {
  DETECTED: ['ASSESSING'],
  ASSESSING: ['CONTAINED'],
  CONTAINED: ['BOARD_NOTIFIED', 'USERS_NOTIFIED', 'CLOSED'],
  BOARD_NOTIFIED: ['USERS_NOTIFIED', 'CLOSED'],
  USERS_NOTIFIED: ['CLOSED'],
  CLOSED: [],
};

const LABEL: Record<PrivacyIncidentStatus, string> = {
  DETECTED: 'Detected',
  ASSESSING: 'Move to Assessing',
  CONTAINED: 'Mark Contained',
  BOARD_NOTIFIED: 'Mark Board Notified',
  USERS_NOTIFIED: 'Mark Users Notified',
  CLOSED: 'Close incident',
};

// Every transition demands a note (recorded on the incident's timeline)
// and a fresh step-up, same as any other privacy.incidents.manage action --
// see app/api/privacy/incidents/[incidentId]/route.ts.
export default function IncidentControls({ incidentId, status }: { incidentId: string; status: PrivacyIncidentStatus }) {
  const endpoint = `/api/privacy/incidents/${incidentId}`;
  const options = NEXT_STATUS[status];

  if (options.length === 0) return <p className="text-xs text-inkFaint">This incident is closed.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((next) => (
        <ConfirmActionButton
          key={next}
          label={LABEL[next]}
          confirmTitle={LABEL[next]}
          confirmDescription={
            next === 'BOARD_NOTIFIED'
              ? 'Confirms the Data Protection Board of India has been notified of this breach.'
              : next === 'USERS_NOTIFIED'
                ? 'Confirms affected users have been notified.'
                : undefined
          }
          endpoint={endpoint}
          method="PATCH"
          extraBody={{ status: next }}
          tone={next === 'CLOSED' ? 'default' : 'critical'}
          requireStepUp
        />
      ))}
    </div>
  );
}

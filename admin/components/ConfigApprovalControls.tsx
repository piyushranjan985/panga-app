'use client';

import ConfirmActionButton from '@/components/ConfirmActionButton';

export default function ConfigApprovalControls({ changeId }: { changeId: string }) {
  const endpoint = `/api/config/changes/${changeId}/review`;
  return (
    <div className="flex gap-2">
      <ConfirmActionButton label="Approve" confirmTitle="Approve and apply this change" endpoint={endpoint} method="PATCH" extraBody={{ status: 'APPROVED' }} requireReason={false} requireStepUp />
      <ConfirmActionButton label="Reject" confirmTitle="Reject this change" endpoint={endpoint} method="PATCH" extraBody={{ status: 'REJECTED' }} requireStepUp />
    </div>
  );
}

import type { PhotoModerationDecision } from '@prisma/client';
import ConfirmActionButton from '@/components/ConfirmActionButton';

interface Props {
  photoId: string;
  currentStatus: PhotoModerationDecision;
  isRemoved: boolean;
}

// Always available, independent of the ModerationCase's own status --
// unlike the Resolve/Dismiss buttons in ModerationCaseActions (which
// only ever touch a photo once, and disappear the moment the case
// closes), this lets an admin correct a photo's visibility decision at
// any time, including after the case is already RESOLVED or DISMISSED.
// Exists because a misclick on Resolve/Dismiss, or new information
// surfacing later, previously had no fix short of editing the database.
export default function PhotoDecisionOverride({ photoId, currentStatus, isRemoved }: Props) {
  if (isRemoved) return null;

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-bold">Photo decision</h2>
      <p className="mb-3 text-xs text-inkFaint">
        Currently <span className="font-semibold">{currentStatus}</span>. Visible to other users in Discover only when APPROVED.
        Changing this takes effect immediately and notifies the photo&rsquo;s owner.
      </p>
      <div className="flex gap-2">
        <ConfirmActionButton
          label="Approve photo"
          confirmTitle="Approve this photo"
          confirmDescription="The photo becomes visible to other users in Discover right away, and the owner is notified. No logout needed on their end."
          endpoint={`/api/moderation/photos/${photoId}/decision`}
          extraBody={{ decision: 'APPROVED' }}
        />
        <ConfirmActionButton
          label="Reject photo"
          confirmTitle="Reject this photo"
          confirmDescription="The photo stays (or becomes) invisible to other users in Discover, and the owner is notified."
          endpoint={`/api/moderation/photos/${photoId}/decision`}
          extraBody={{ decision: 'REJECTED' }}
          tone="critical"
        />
      </div>
    </div>
  );
}

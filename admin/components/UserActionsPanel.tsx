'use client';

import type { AdminRole, AccountStatus } from '@prisma/client';
import { hasPermission } from '@/lib/rbac';
import ConfirmActionButton from '@/components/ConfirmActionButton';

interface Props {
  userId: string;
  role: AdminRole;
  status: AccountStatus;
  messagingRestricted: boolean;
  discoveryRestricted: boolean;
  profileHidden: boolean;
}

// Every button here is one thin call into
// app/api/users/[userId]/actions/route.ts's single `action` dispatcher --
// see that file for what each one actually does and which permission +
// step-up requirement gates it (lib/rbac.ts).
export default function UserActionsPanel({ userId, role, status, messagingRestricted, discoveryRestricted, profileHidden }: Props) {
  const endpoint = `/api/users/${userId}/actions`;

  return (
    <div className="flex flex-wrap gap-2">
      {hasPermission(role, 'users.action.warn') && (
        <ConfirmActionButton label="Warn" confirmTitle="Warn this user" endpoint={endpoint} extraBody={{ action: 'warn' }} />
      )}
      {hasPermission(role, 'users.action.suspend') &&
        (status === 'SUSPENDED' ? (
          <ConfirmActionButton label="Unsuspend" confirmTitle="Unsuspend this user" endpoint={endpoint} extraBody={{ action: 'unsuspend' }} />
        ) : (
          <ConfirmActionButton label="Suspend" confirmTitle="Suspend this user" endpoint={endpoint} extraBody={{ action: 'suspend' }} tone="critical" />
        ))}
      {hasPermission(role, 'users.action.ban') &&
        (status === 'BANNED' ? (
          <ConfirmActionButton label="Unban" confirmTitle="Unban this user" endpoint={endpoint} extraBody={{ action: 'unban' }} />
        ) : (
          <ConfirmActionButton label="Ban" confirmTitle="Ban this user permanently" endpoint={endpoint} extraBody={{ action: 'ban' }} tone="critical" requireStepUp />
        ))}
      {hasPermission(role, 'users.action.forceLogout') && (
        <ConfirmActionButton label="Force logout" confirmTitle="Force logout everywhere" endpoint={endpoint} extraBody={{ action: 'forceLogout' }} requireReason={false} />
      )}
      {hasPermission(role, 'users.action.resetVerification') && (
        <ConfirmActionButton label="Reset verification" confirmTitle="Reset verification status" endpoint={endpoint} extraBody={{ action: 'resetVerification' }} />
      )}
      {hasPermission(role, 'users.action.restrictMessaging') && (
        <ConfirmActionButton
          label={messagingRestricted ? 'Unrestrict messaging' : 'Restrict messaging'}
          confirmTitle={messagingRestricted ? 'Remove messaging restriction' : 'Restrict messaging'}
          endpoint={endpoint}
          extraBody={{ action: messagingRestricted ? 'unrestrictMessaging' : 'restrictMessaging' }}
        />
      )}
      {hasPermission(role, 'users.action.restrictDiscovery') && (
        <ConfirmActionButton
          label={discoveryRestricted ? 'Unrestrict discovery' : 'Restrict discovery'}
          confirmTitle={discoveryRestricted ? 'Remove discovery restriction' : 'Restrict discovery'}
          endpoint={endpoint}
          extraBody={{ action: discoveryRestricted ? 'unrestrictDiscovery' : 'restrictDiscovery' }}
        />
      )}
      {hasPermission(role, 'users.action.hideProfile') && (
        <ConfirmActionButton
          label={profileHidden ? 'Unhide profile' : 'Hide profile'}
          confirmTitle={profileHidden ? 'Unhide this profile' : 'Hide this profile'}
          endpoint={endpoint}
          extraBody={{ action: profileHidden ? 'unhideProfile' : 'hideProfile' }}
        />
      )}
      {hasPermission(role, 'users.action.deleteAccount') && (
        <ConfirmActionButton
          label="Delete account"
          confirmTitle="Permanently delete this account"
          confirmDescription="This anonymizes the account and removes it from the app. This cannot be undone from here."
          endpoint={endpoint}
          extraBody={{ action: 'deleteAccount' }}
          tone="critical"
          requireStepUp
        />
      )}
    </div>
  );
}

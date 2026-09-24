import type { Permission } from '@/lib/rbac';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
}

// The left nav from the spec, in order. Each entry's `permission` decides
// both whether it's shown (components/Sidebar.tsx filters by role) and
// whether the page itself renders (every page under app/(console)/ opens
// with requirePageAccess(permission) from lib/pageGuard.ts) -- one source
// of truth for both.
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', permission: 'dashboard.view' },
  { href: '/users', label: 'Users', icon: '👤', permission: 'users.view' },
  { href: '/moderation', label: 'Moderation', icon: '🛡️', permission: 'moderation.view' },
  { href: '/reports', label: 'Reports', icon: '🚩', permission: 'moderation.view' },
  { href: '/engagement', label: 'Matches & Engagement', icon: '💞', permission: 'analytics.view' },
  { href: '/support', label: 'Support', icon: '🎧', permission: 'support.view' },
  { href: '/privacy', label: 'Privacy & Compliance', icon: '🔏', permission: 'privacy.view' },
  { href: '/analytics', label: 'Analytics', icon: '📈', permission: 'analytics.view' },
  { href: '/trends', label: 'Trends', icon: '📉', permission: 'analytics.view' },
  { href: '/payments', label: 'Payments', icon: '💳', permission: 'payments.view' },
  { href: '/notifications', label: 'Notifications', icon: '🔔', permission: 'notifications.view' },
  { href: '/configuration', label: 'Configuration', icon: '⚙️', permission: 'config.view' },
  { href: '/system-health', label: 'System Health', icon: '🩺', permission: 'systemHealth.view' },
  { href: '/audit-logs', label: 'Audit Logs', icon: '📜', permission: 'auditLogs.view' },
  { href: '/admin-roles', label: 'Admin & Roles', icon: '🗝️', permission: 'adminUsers.manage' },
];

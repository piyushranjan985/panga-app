import type { AdminRole } from '@prisma/client';

// The full capability list for the portal. Every sensitive UI control and
// every mutating API route is gated by one of these -- see
// requirePermission() below and hasPermission() for read-time checks
// (e.g. hiding a nav item or a button, not just blocking the request).
export type Permission =
  | 'dashboard.view'
  | 'users.view'
  | 'users.viewSensitivePII' // unmask email/phone/precise location/DOB
  | 'users.export'
  | 'users.action.warn'
  | 'users.action.suspend'
  | 'users.action.ban'
  | 'users.action.forceLogout'
  | 'users.action.resetVerification'
  | 'users.action.restrictMessaging'
  | 'users.action.restrictDiscovery'
  | 'users.action.hideProfile'
  | 'users.action.removePhoto'
  | 'users.action.deleteAccount'
  | 'moderation.view'
  | 'moderation.viewRiskScore'
  | 'moderation.assign'
  | 'moderation.resolve'
  | 'moderation.appeals.review'
  | 'content.moderate'
  | 'analytics.view'
  | 'analytics.export'
  | 'support.view'
  | 'support.respond'
  | 'support.assign'
  | 'privacy.view'
  | 'privacy.requests.handle'
  | 'privacy.consents.view'
  | 'privacy.incidents.manage'
  | 'privacy.legalHolds.manage'
  | 'privacy.processors.manage'
  | 'privacy.retention.manage'
  | 'privacy.processingActivities.manage'
  | 'notifications.view'
  | 'notifications.acknowledge'
  | 'config.view'
  | 'config.propose'
  | 'config.approve'
  | 'config.featureFlags.manage'
  | 'payments.view'
  | 'reporting.export'
  | 'systemHealth.view'
  | 'auditLogs.view'
  | 'auditLogs.export'
  | 'adminUsers.manage';

const ALL: Permission[] = [
  'dashboard.view',
  'users.view',
  'users.viewSensitivePII',
  'users.export',
  'users.action.warn',
  'users.action.suspend',
  'users.action.ban',
  'users.action.forceLogout',
  'users.action.resetVerification',
  'users.action.restrictMessaging',
  'users.action.restrictDiscovery',
  'users.action.hideProfile',
  'users.action.removePhoto',
  'users.action.deleteAccount',
  'moderation.view',
  'moderation.viewRiskScore',
  'moderation.assign',
  'moderation.resolve',
  'moderation.appeals.review',
  'content.moderate',
  'analytics.view',
  'analytics.export',
  'support.view',
  'support.respond',
  'support.assign',
  'privacy.view',
  'privacy.requests.handle',
  'privacy.consents.view',
  'privacy.incidents.manage',
  'privacy.legalHolds.manage',
  'privacy.processors.manage',
  'privacy.retention.manage',
  'privacy.processingActivities.manage',
  'notifications.view',
  'notifications.acknowledge',
  'config.view',
  'config.propose',
  'config.approve',
  'config.featureFlags.manage',
  'payments.view',
  'reporting.export',
  'systemHealth.view',
  'auditLogs.view',
  'auditLogs.export',
  'adminUsers.manage',
];

const VIEW_ONLY: Permission[] = [
  'dashboard.view',
  'users.view',
  'moderation.view',
  'analytics.view',
  'support.view',
  'privacy.view',
  'notifications.view',
  'config.view',
  'payments.view',
  'systemHealth.view',
  'auditLogs.view',
];

// Each role's grant is spelled out explicitly (no inheritance chain) so
// this table is the single, readable source of truth for "who can do
// what" -- exactly the question the spec's "Important Design Principle"
// section asks every sensitive capability to answer.
export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: ALL,

  ADMIN: ALL.filter((p) => p !== 'adminUsers.manage'),

  OPERATIONS: [
    'dashboard.view',
    'users.view',
    'users.action.forceLogout',
    'users.action.resetVerification',
    'users.action.restrictMessaging',
    'users.action.restrictDiscovery',
    'users.action.hideProfile',
    'analytics.view',
    'support.view',
    'notifications.view',
    'notifications.acknowledge',
    'config.view',
    'config.propose',
    'reporting.export',
    'systemHealth.view',
  ],

  TRUST_AND_SAFETY: [
    'dashboard.view',
    'users.view',
    'users.viewSensitivePII',
    'users.action.warn',
    'users.action.suspend',
    'users.action.ban',
    'users.action.forceLogout',
    'users.action.restrictMessaging',
    'users.action.restrictDiscovery',
    'users.action.hideProfile',
    'users.action.removePhoto',
    'users.action.deleteAccount',
    'moderation.view',
    'moderation.viewRiskScore',
    'moderation.assign',
    'moderation.resolve',
    'moderation.appeals.review',
    'content.moderate',
    'analytics.view',
    'notifications.view',
    'notifications.acknowledge',
    'reporting.export',
  ],

  MODERATOR: [
    'dashboard.view',
    'users.view',
    'moderation.view',
    'moderation.assign',
    'moderation.resolve',
    'content.moderate',
    'notifications.view',
  ],

  CUSTOMER_SUPPORT: [
    'dashboard.view',
    'users.view',
    'users.viewSensitivePII',
    'users.action.forceLogout',
    'users.action.resetVerification',
    'support.view',
    'support.respond',
    'support.assign',
    'notifications.view',
  ],

  PRIVACY_OFFICER: [
    'dashboard.view',
    'users.view',
    'users.viewSensitivePII',
    'privacy.view',
    'privacy.requests.handle',
    'privacy.consents.view',
    'privacy.legalHolds.manage',
    'privacy.retention.manage',
    'notifications.view',
    'notifications.acknowledge',
    'auditLogs.view',
    'reporting.export',
  ],

  COMPLIANCE_OFFICER: [
    'dashboard.view',
    'users.view',
    'users.viewSensitivePII',
    'privacy.view',
    'privacy.requests.handle',
    'privacy.consents.view',
    'privacy.incidents.manage',
    'privacy.legalHolds.manage',
    'privacy.processors.manage',
    'privacy.retention.manage',
    'privacy.processingActivities.manage',
    'notifications.view',
    'notifications.acknowledge',
    'auditLogs.view',
    'auditLogs.export',
    'reporting.export',
  ],

  FINANCE: ['dashboard.view', 'payments.view', 'reporting.export', 'analytics.view'],

  ANALYTICS: ['dashboard.view', 'analytics.view', 'analytics.export', 'reporting.export'],

  READ_ONLY: VIEW_ONLY,
};

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: AdminRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

// Actions destructive/high-risk enough to demand step-up auth (a fresh
// password + MFA check within the last ADMIN_STEP_UP_TTL_MINUTES) even
// from an already-logged-in admin with the base permission -- "Destructive
// /high-risk actions must require confirmation" from the spec, enforced
// server-side, not just a client-side confirm() dialog.
export const STEP_UP_REQUIRED: Permission[] = [
  'users.action.ban',
  'users.action.deleteAccount',
  'privacy.requests.handle',
  'privacy.incidents.manage',
  'privacy.legalHolds.manage',
  'config.approve',
  'adminUsers.manage',
];

export function requiresStepUp(permission: Permission): boolean {
  return STEP_UP_REQUIRED.includes(permission);
}

// Flat permission x step-up list for the Admin & Roles permission-matrix
// table (app/(console)/admin-roles/page.tsx) -- avoids that page having
// to import ALL and STEP_UP_REQUIRED separately and zip them itself.
export const ALL_PERMISSIONS_FOR_DISPLAY: { permission: Permission; stepUp: boolean }[] = ALL.map((permission) => ({
  permission,
  stepUp: requiresStepUp(permission),
}));

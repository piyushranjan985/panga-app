import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  requiresStepUp,
  ALL_PERMISSIONS_FOR_DISPLAY,
  type Permission,
} from '../lib/rbac';
import type { AdminRole } from '@prisma/client';

const ROLES = Object.keys(ROLE_PERMISSIONS) as AdminRole[];

describe('lib/rbac -- role/permission invariants', () => {
  test('SUPER_ADMIN holds every permission', () => {
    const allPermissions = ALL_PERMISSIONS_FOR_DISPLAY.map((p) => p.permission);
    for (const permission of allPermissions) {
      assert.equal(hasPermission('SUPER_ADMIN', permission), true, `SUPER_ADMIN should have ${permission}`);
    }
  });

  test('ADMIN holds everything except adminUsers.manage', () => {
    assert.equal(hasPermission('ADMIN', 'adminUsers.manage'), false);
    assert.equal(hasPermission('ADMIN', 'users.action.ban'), true);
    assert.equal(hasPermission('ADMIN', 'privacy.incidents.manage'), true);
  });

  test('READ_ONLY only holds *.view permissions, nothing mutating', () => {
    for (const permission of ROLE_PERMISSIONS.READ_ONLY) {
      assert.match(permission, /\.view$/, `READ_ONLY should not hold mutating permission ${permission}`);
    }
  });

  test('MODERATOR cannot see risk scores or unmask PII', () => {
    assert.equal(hasPermission('MODERATOR', 'moderation.viewRiskScore'), false);
    assert.equal(hasPermission('MODERATOR', 'users.viewSensitivePII'), false);
    // ... but can still work the queue.
    assert.equal(hasPermission('MODERATOR', 'moderation.resolve'), true);
  });

  test('FINANCE and ANALYTICS cannot touch user enforcement actions', () => {
    for (const role of ['FINANCE', 'ANALYTICS'] as AdminRole[]) {
      assert.equal(hasPermission(role, 'users.action.ban'), false);
      assert.equal(hasPermission(role, 'users.action.deleteAccount'), false);
    }
  });

  test('every role is a real, distinct grant (no two roles are identical to SUPER_ADMIN except ADMIN/SUPER_ADMIN themselves)', () => {
    const superAdminSet = new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
    for (const role of ROLES) {
      if (role === 'SUPER_ADMIN' || role === 'ADMIN') continue;
      const sameAsSuperAdmin = ROLE_PERMISSIONS[role].length === superAdminSet.size &&
        ROLE_PERMISSIONS[role].every((p) => superAdminSet.has(p));
      assert.equal(sameAsSuperAdmin, false, `${role} should not have the full SUPER_ADMIN grant`);
    }
  });

  test('hasAnyPermission is true if at least one permission matches', () => {
    assert.equal(hasAnyPermission('MODERATOR', ['auditLogs.export', 'moderation.resolve']), true);
    assert.equal(hasAnyPermission('MODERATOR', ['auditLogs.export', 'adminUsers.manage']), false);
  });

  test('every STEP_UP_REQUIRED permission is granted to at least one role (not dead config)', () => {
    const stepUpPermissions = ALL_PERMISSIONS_FOR_DISPLAY.filter((p) => p.stepUp).map((p) => p.permission);
    assert.ok(stepUpPermissions.length > 0, 'expected at least one step-up-gated permission');
    for (const permission of stepUpPermissions) {
      const grantedSomewhere = ROLES.some((role) => hasPermission(role, permission));
      assert.equal(grantedSomewhere, true, `${permission} is step-up-required but granted to no role`);
    }
  });

  test('the highest-risk destructive actions all require step-up', () => {
    const mustRequireStepUp: Permission[] = ['users.action.ban', 'users.action.deleteAccount', 'privacy.legalHolds.manage', 'adminUsers.manage'];
    for (const permission of mustRequireStepUp) {
      assert.equal(requiresStepUp(permission), true, `${permission} should require step-up`);
    }
  });

  test('a merely-viewing permission never requires step-up', () => {
    assert.equal(requiresStepUp('dashboard.view'), false);
    assert.equal(requiresStepUp('users.view'), false);
    assert.equal(requiresStepUp('auditLogs.view'), false);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PERMISSIONS, requiresStepUp } from '../lib/rbac';

describe('admin/lib/rbac -- payments permissions', () => {
  test('FINANCE can view, manage plans, and override subscriptions', () => {
    const finance = ROLE_PERMISSIONS.FINANCE;
    assert.ok(finance.includes('payments.view'));
    assert.ok(finance.includes('payments.manage'));
    assert.ok(finance.includes('payments.subscriptions.override'));
  });

  test('MODERATOR and CUSTOMER_SUPPORT have no payments access at all', () => {
    for (const role of ['MODERATOR', 'CUSTOMER_SUPPORT'] as const) {
      const perms = ROLE_PERMISSIONS[role];
      assert.ok(!perms.includes('payments.view'));
      assert.ok(!perms.includes('payments.manage'));
      assert.ok(!perms.includes('payments.subscriptions.override'));
    }
  });

  test('SUPER_ADMIN and ADMIN get every payments permission', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN'] as const) {
      const perms = ROLE_PERMISSIONS[role];
      assert.ok(perms.includes('payments.view'));
      assert.ok(perms.includes('payments.manage'));
      assert.ok(perms.includes('payments.subscriptions.override'));
    }
  });

  test('a manual subscription override demands step-up, plain plan editing does not', () => {
    assert.equal(requiresStepUp('payments.subscriptions.override'), true);
    assert.equal(requiresStepUp('payments.manage'), false);
  });

  test('READ_ONLY can see payments but never manage or override', () => {
    const readOnly = ROLE_PERMISSIONS.READ_ONLY;
    assert.ok(readOnly.includes('payments.view'));
    assert.ok(!readOnly.includes('payments.manage'));
    assert.ok(!readOnly.includes('payments.subscriptions.override'));
  });
});

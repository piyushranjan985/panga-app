import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfigKey } from '../lib/configApproval';

describe('lib/configApproval -- config-change routing', () => {
  test('parses a feature-flag key', () => {
    assert.deepEqual(parseConfigKey('featureFlag:new_discovery_algo'), { kind: 'featureFlag', key: 'new_discovery_algo' });
  });

  test('parses a notification-template key', () => {
    assert.deepEqual(parseConfigKey('notificationTemplate:account.suspended'), { kind: 'notificationTemplate', key: 'account.suspended' });
  });

  test('an unprefixed key is unknown (rejected by the propose route)', () => {
    assert.deepEqual(parseConfigKey('maintenance_mode'), { kind: 'unknown', key: 'maintenance_mode' });
  });

  test('a key can itself contain colons (e.g. a namespaced template key)', () => {
    assert.deepEqual(parseConfigKey('notificationTemplate:privacy:deletion.completed'), {
      kind: 'notificationTemplate',
      key: 'privacy:deletion.completed',
    });
  });
});

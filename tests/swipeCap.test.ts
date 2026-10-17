import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getFreeTierSwipeDailyCap, evaluateFreeSwipeCount } from '../lib/payments/swipeCap';

describe('lib/payments/swipeCap -- getFreeTierSwipeDailyCap', () => {
  const saved = process.env.SWIPE_FREE_DAILY_CAP;
  test('defaults to 20', () => {
    delete process.env.SWIPE_FREE_DAILY_CAP;
    assert.equal(getFreeTierSwipeDailyCap(), 20);
  });
  test('reads a valid override', () => {
    process.env.SWIPE_FREE_DAILY_CAP = '7';
    assert.equal(getFreeTierSwipeDailyCap(), 7);
  });
  test('falls back on an invalid override', () => {
    process.env.SWIPE_FREE_DAILY_CAP = 'nope';
    assert.equal(getFreeTierSwipeDailyCap(), 20);
    if (saved === undefined) delete process.env.SWIPE_FREE_DAILY_CAP;
    else process.env.SWIPE_FREE_DAILY_CAP = saved;
  });
});

describe('lib/payments/swipeCap -- evaluateFreeSwipeCount', () => {
  test('ok under the cap', () => assert.equal(evaluateFreeSwipeCount(20, 19).ok, true));
  test('ok at zero', () => assert.equal(evaluateFreeSwipeCount(20, 0).ok, true));
  test('not ok at the cap', () => assert.equal(evaluateFreeSwipeCount(20, 20).ok, false));
  test('not ok over the cap', () => assert.equal(evaluateFreeSwipeCount(20, 25).ok, false));
});

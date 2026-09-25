import { describe, expect, it } from 'vitest';
import { decodeEntitlementCache, encodeEntitlementCache } from '../domain/entitlement/cache-codec';
import {
  advanceClock,
  cacheFromStore,
  decideFromCache,
  decideFromStore,
  offlineDeadline,
  OFFLINE_WINDOW_MS,
} from '../domain/entitlement/policy';
import {
  PREMIUM_PRICE,
  PREMIUM_STATES,
  SUBSCRIPTION_STATES,
  type EntitlementCache,
  type SubscriptionState,
  type VerifiedSubscription,
} from '../domain/entitlement/subscription';

const T = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const sub = (state: SubscriptionState, expiresAt: number | null, verifiedAt = T): VerifiedSubscription => ({
  provider: 'fake', productId: 'p', state, expiresAt, verifiedAt, willRenew: true,
});
const cache = (overrides: Partial<EntitlementCache> = {}): EntitlementCache => ({
  version: 1, provider: 'fake', productId: 'p', state: 'active', expiresAt: T + 30 * DAY,
  lastVerifiedAt: T, clockHighWaterMark: T, ...overrides,
});

describe('product definition', () => {
  it('has one premium entitlement at $7.99/month and exactly two premium states', () => {
    expect(PREMIUM_PRICE.label).toBe('Premium — $7.99/month');
    expect([...PREMIUM_STATES].sort()).toEqual(['active', 'grace_period']);
    expect(SUBSCRIPTION_STATES).toEqual(
      expect.arrayContaining(['active', 'grace_period', 'billing_retry', 'account_hold', 'paused', 'pending', 'expired', 'refunded', 'unknown']),
    );
  });
});

describe('store answers: every subscription state', () => {
  for (const state of SUBSCRIPTION_STATES) {
    const expected = state === 'active' || state === 'grace_period';
    it(`${state} with a future expiry → ${expected ? 'PREMIUM' : 'FREE'}`, () => {
      const decision = decideFromStore(sub(state, T + DAY), 'fake', T);
      expect(decision.premium).toBe(expected);
      expect(decision.source).toBe('store');
      expect(decision.state).toBe(state);
    });
  }

  it('no subscription at all → FREE (not_subscribed)', () => {
    expect(decideFromStore(null, 'fake', T)).toMatchObject({ premium: false, reason: 'not_subscribed', state: 'none' });
  });

  it('active or grace but already past expiry → FREE (expired)', () => {
    expect(decideFromStore(sub('active', T), 'fake', T)).toMatchObject({ premium: false, reason: 'expired' });
    expect(decideFromStore(sub('grace_period', T - 1), 'fake', T)).toMatchObject({ premium: false, reason: 'expired' });
  });

  it('a premium state with no expiry is never treated as premium', () => {
    expect(decideFromStore(sub('active', null), 'fake', T).premium).toBe(false);
  });
});

describe('offline cache: MIN(subscriptionExpiry, lastVerifiedAt + 7 days)', () => {
  it('deadline is the earlier of expiry and the 7-day window', () => {
    expect(offlineDeadline({ expiresAt: T + 30 * DAY, lastVerifiedAt: T })).toBe(T + 7 * DAY);
    expect(offlineDeadline({ expiresAt: T + 3 * DAY, lastVerifiedAt: T })).toBe(T + 3 * DAY);
    expect(OFFLINE_WINDOW_MS).toBe(7 * DAY);
  });

  it('7-day boundary: premium one millisecond before, FREE (stale) at exactly 7 days', () => {
    expect(decideFromCache(cache(), 'fake', T + 7 * DAY - 1)).toMatchObject({ premium: true, reason: 'cached' });
    expect(decideFromCache(cache(), 'fake', T + 7 * DAY)).toMatchObject({ premium: false, reason: 'cache_stale' });
    expect(decideFromCache(cache(), 'fake', T + 20 * DAY).premium).toBe(false);
  });

  it('expiry before the 7-day boundary ends premium at the expiry, never 7 days after it', () => {
    const c = cache({ expiresAt: T + 3 * DAY });
    expect(decideFromCache(c, 'fake', T + 3 * DAY - 1).premium).toBe(true);
    expect(decideFromCache(c, 'fake', T + 3 * DAY)).toMatchObject({ premium: false, reason: 'expired' });
    expect(decideFromCache(c, 'fake', T + 6 * DAY).premium).toBe(false);
  });

  it('only active and grace_period can be premium from the cache', () => {
    for (const state of SUBSCRIPTION_STATES) {
      expect(decideFromCache(cache({ state }), 'fake', T + DAY).premium, state).toBe(state === 'active' || state === 'grace_period');
    }
  });

  it('clock moved backwards → FREE until the store verifies again', () => {
    const c = cache({ clockHighWaterMark: T + 2 * DAY });
    expect(decideFromCache(c, 'fake', T + DAY)).toMatchObject({ premium: false, reason: 'clock_rollback' });
    expect(decideFromCache(cache(), 'fake', T - 1)).toMatchObject({ premium: false, reason: 'clock_rollback' });
  });

  it('a cache from another provider (e.g. the dev fake store in a release build) is ignored', () => {
    expect(decideFromCache(cache({ provider: 'fake' }), 'unavailable', T + DAY)).toMatchObject({ premium: false, reason: 'unverified' });
    expect(decideFromCache(cache({ provider: 'fake' }), 'app_store', T + DAY).premium).toBe(false);
  });

  it('no cache → FREE', () => {
    expect(decideFromCache(null, 'fake', T)).toMatchObject({ premium: false, reason: 'unverified', source: 'none' });
  });
});

describe('cache writing and clock guard', () => {
  it('stores state, expiry, provider and store verification time, not a premium flag', () => {
    const c = cacheFromStore(sub('active', T + DAY, T + 5), 'fake', T);
    expect(c).toEqual({ version: 1, provider: 'fake', productId: 'p', state: 'active', expiresAt: T + DAY, lastVerifiedAt: T + 5, clockHighWaterMark: T + 5 });
    expect(Object.keys(c)).not.toContain('premium');
    expect(Object.keys(c)).not.toContain('isPremium');
  });

  it('re-anchors the clock guard to store time when the device clock is behind', () => {
    expect(cacheFromStore(sub('active', T + DAY, T + 10 * DAY), 'fake', T).clockHighWaterMark).toBe(T + 10 * DAY);
  });

  it('the clock guard only moves forward', () => {
    const c = cache({ clockHighWaterMark: T + 100 });
    expect(advanceClock(c, T + 50)).toBe(c);
    expect(advanceClock(c, T + 200).clockHighWaterMark).toBe(T + 200);
  });
});

describe('cache codec is strict', () => {
  it('round-trips a valid cache', () => {
    expect(decodeEntitlementCache(encodeEntitlementCache(cache()))).toEqual(cache());
  });

  it('treats anything malformed as no cache', () => {
    const good = cache() as unknown as Record<string, unknown>;
    const bad = [
      null, '', 'not json', '[]', '42',
      JSON.stringify({ ...good, version: 2 }),
      JSON.stringify({ ...good, provider: 'hacker' }),
      JSON.stringify({ ...good, state: 'lifetime' }),
      JSON.stringify({ ...good, expiresAt: 'forever' }),
      JSON.stringify({ ...good, lastVerifiedAt: -1 }),
      JSON.stringify({ ...good, clockHighWaterMark: null }),
    ];
    for (const raw of bad) expect(decodeEntitlementCache(raw as string | null), String(raw)).toBeNull();
  });

  it('an injected "premium: true" field grants nothing', () => {
    const raw = JSON.stringify({ ...cache({ state: 'expired', expiresAt: T - 1 }), premium: true, isPremium: true });
    const decoded = decodeEntitlementCache(raw);
    expect(decoded).not.toHaveProperty('premium');
    expect(decideFromCache(decoded, 'fake', T).premium).toBe(false);
  });
});

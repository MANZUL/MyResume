import { afterEach, describe, expect, it } from 'vitest';
import type { EntitlementDecision } from '../domain/entitlement/policy';
import { SUBSCRIPTION_STATES } from '../domain/entitlement/subscription';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { UnavailableStoreProvider } from '../services/entitlement/store-provider';

const T = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** Device clock and store clock are separate, so clock rollback can be simulated. */
function setup() {
  const clock = { device: T, store: T };
  const store = new FakeStoreProvider({ storeNow: () => clock.store });
  const cache = new MemoryEntitlementCacheStore();
  const service = new EntitlementService(store, cache, () => clock.device);
  const advance = (ms: number) => {
    clock.device += ms;
    clock.store += ms;
  };
  return { clock, store, cache, service, advance };
}

describe('fake store: every subscription state through the service', () => {
  for (const state of SUBSCRIPTION_STATES) {
    it(`${state}`, async () => {
      const { store, service } = setup();
      store.setSubscription(state, T + DAY);
      const decision = await service.check();
      expect(decision.premium).toBe(state === 'active' || state === 'grace_period');
      expect(decision.state).toBe(state);
    });
  }
});

describe('online and offline', () => {
  it('active + online → PREMIUM (verified) and the cache is written without a premium flag', async () => {
    const { store, service, cache } = setup();
    store.setSubscription('active', T + 30 * DAY);
    expect(await service.check()).toMatchObject({ premium: true, reason: 'verified', source: 'store' });
    const stored = JSON.parse(cache.value!);
    expect(stored).toMatchObject({ state: 'active', provider: 'fake', lastVerifiedAt: T, expiresAt: T + 30 * DAY });
    expect(stored).not.toHaveProperty('premium');
  });

  it('active + offline → PREMIUM from cache within 7 days, FREE after', async () => {
    const { store, service, advance } = setup();
    store.setSubscription('active', T + 30 * DAY);
    await service.check();
    store.online = false;
    advance(6 * DAY);
    expect(await service.check()).toMatchObject({ premium: true, reason: 'cached', source: 'cache' });
    advance(DAY);
    expect(await service.check()).toMatchObject({ premium: false, reason: 'cache_stale' });
    store.online = true;
    expect(await service.check()).toMatchObject({ premium: true, reason: 'verified' });
  });

  it('offline and never verified → FREE', async () => {
    const { store, service } = setup();
    store.setSubscription('active', T + 30 * DAY);
    store.online = false;
    expect(await service.check()).toMatchObject({ premium: false, reason: 'unverified' });
  });

  it('offline FREE user stays FREE', async () => {
    const { store, service } = setup();
    await service.check(); // verified: no subscription
    store.online = false;
    expect(await service.check()).toMatchObject({ premium: false, reason: 'not_subscribed' });
  });

  it('subscription expiry while offline ends premium at the expiry (no 7 extra days)', async () => {
    const { store, service, advance } = setup();
    store.setSubscription('active', T + 2 * DAY);
    await service.check();
    store.online = false;
    advance(2 * DAY - 1);
    expect((await service.check()).premium).toBe(true);
    advance(1);
    expect(await service.check()).toMatchObject({ premium: false, reason: 'expired' });
  });

  it('expiry while online → FREE immediately', async () => {
    const { store, service, advance } = setup();
    store.setSubscription('active', T + DAY);
    expect((await service.check()).premium).toBe(true);
    advance(DAY);
    expect(await service.check()).toMatchObject({ premium: false, reason: 'expired' });
  });
});

describe('transitions', () => {
  it('free → premium → refunded → free, with listeners notified', async () => {
    const { store, service } = setup();
    const seen: boolean[] = [];
    service.subscribe((d: EntitlementDecision) => seen.push(d.premium));
    await service.check();
    store.setSubscription('active', T + 30 * DAY);
    await service.check();
    store.refund();
    await service.check();
    expect(seen).toEqual([false, true, false]);
    expect(service.snapshot()).toMatchObject({ premium: false, state: 'refunded' });
  });

  it('a refund seen online also removes offline premium', async () => {
    const { store, service } = setup();
    store.setSubscription('active', T + 30 * DAY);
    await service.check();
    store.refund();
    await service.check();
    store.online = false;
    expect(await service.check()).toMatchObject({ premium: false, state: 'refunded' });
  });

  it('grace period → premium; billing retry / account hold / paused → free', async () => {
    const { store, service } = setup();
    store.setSubscription('grace_period', T + 3 * DAY);
    expect((await service.check()).premium).toBe(true);
    for (const state of ['billing_retry', 'account_hold', 'paused'] as const) {
      store.setSubscription(state, T + 3 * DAY);
      expect((await service.check()).premium, state).toBe(false);
    }
  });
});

describe('lifecycle: cancel at period end, renewal, reinstall', () => {
  it('cancelled (auto-renew off) stays PREMIUM until the paid period ends, then FREE', async () => {
    const { store, service, advance } = setup();
    store.setSubscription('active', T + 10 * DAY, false);
    advance(9 * DAY);
    expect((await service.check()).premium).toBe(true);
    advance(DAY);
    expect(await service.check()).toMatchObject({ premium: false, reason: 'expired' });
  });

  it('renewal extends premium past the old expiry', async () => {
    const { store, service, advance } = setup();
    store.setSubscription('active', T + 30 * DAY);
    advance(29 * DAY);
    store.setSubscription('active', T + 60 * DAY); // store renewed the subscription
    advance(2 * DAY);
    expect(await service.check()).toMatchObject({ premium: true, expiresAt: T + 60 * DAY });
  });

  it('reinstall (empty cache): online restores PREMIUM from the store; offline stays FREE until verified', async () => {
    const { store, advance } = setup();
    store.setSubscription('active', T + 30 * DAY);
    const fresh = () => new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T + DAY);
    advance(DAY);
    expect((await fresh().check()).premium).toBe(true);
    store.online = false;
    expect(await fresh().check()).toMatchObject({ premium: false, reason: 'unverified' });
  });
});

describe('clock rollback', () => {
  it('forces store verification before cached premium counts again', async () => {
    const { clock, store, service } = setup();
    store.setSubscription('active', T + 30 * DAY);
    await service.check();
    store.online = false;
    clock.device += DAY;
    expect((await service.check()).premium).toBe(true); // advances the clock guard
    clock.device -= 2 * DAY; // user moves the device clock back
    expect(await service.check()).toMatchObject({ premium: false, reason: 'clock_rollback' });

    store.online = true; // the store (with its own clock) verifies again
    expect(await service.check()).toMatchObject({ premium: true, reason: 'verified' });
    store.online = false; // the rolled-back device clock still cannot extend the cache
    expect(await service.check()).toMatchObject({ premium: false, reason: 'clock_rollback' });
  });
});

describe('cache handling', () => {
  it('invalidating the cache removes offline premium', async () => {
    const { store, service } = setup();
    store.setSubscription('active', T + 30 * DAY);
    await service.check();
    await service.invalidateCache();
    store.online = false;
    expect(await service.check()).toMatchObject({ premium: false, reason: 'unverified' });
  });

  it('a tampered or corrupt cache grants nothing', async () => {
    const { store, service, cache } = setup();
    store.online = false;
    cache.value = JSON.stringify({ premium: true, isPremium: true });
    expect((await service.check()).premium).toBe(false);
    cache.value = '{broken';
    expect((await service.check()).premium).toBe(false);
  });

  it('a cache that fails to read or write never grants anything', async () => {
    const { store } = setup();
    const failing = { read: async () => { throw new Error('io'); }, write: async () => { throw new Error('io'); }, clear: async () => undefined };
    const service = new EntitlementService(store, failing, () => T);
    store.setSubscription('active', T + DAY);
    expect((await service.check()).premium).toBe(true); // store answer still works
    store.online = false;
    expect((await service.check()).premium).toBe(false);
  });
});

describe('purchase and restore through the fake store', () => {
  it('successful purchase → verified premium', async () => {
    const { service, store } = setup();
    expect(await service.purchase()).toBe('subscribed');
    expect(await service.check()).toMatchObject({ premium: true, state: 'active' });
    expect(store.calls.purchase).toBe(1);
  });

  it('pending (Ask to Buy) → FREE until approved', async () => {
    const { service, store } = setup();
    store.setNextPurchaseResult({ kind: 'pending' });
    expect(await service.purchase()).toBe('pending');
    expect(await service.check()).toMatchObject({ premium: false, state: 'pending' });
    store.approvePending();
    expect((await service.check()).premium).toBe(true);
  });

  it('cancelled or failed purchase → FREE', async () => {
    const { service, store } = setup();
    store.setNextPurchaseResult({ kind: 'cancelled' });
    expect(await service.purchase()).toBe('cancelled');
    store.setNextPurchaseResult({ kind: 'failed', message: 'card declined' });
    expect(await service.purchase()).toBe('failed');
    expect((await service.check()).premium).toBe(false);
  });

  it('purchase offline fails without granting', async () => {
    const { service, store } = setup();
    store.online = false;
    expect(await service.purchase()).toBe('failed');
    expect((await service.check()).premium).toBe(false);
  });

  it('a "purchased" result that the store does not verify is not premium', async () => {
    const { service, store } = setup();
    store.getVerifiedSubscription = async () => null; // store reports nothing after the purchase
    expect(await service.purchase()).toBe('not_verified');
    expect((await service.check()).premium).toBe(false);
  });

  it('restore returns the store state; offline restore fails and changes nothing', async () => {
    const { service, store } = setup();
    store.setSubscription('active', T + DAY);
    expect((await service.restore()).premium).toBe(true);
    store.online = false;
    await expect(service.restore()).rejects.toThrow();
    expect((await service.check()).premium).toBe(true); // cache from the earlier restore
  });

  it('the release provider never grants premium and offers nothing', async () => {
    const service = new EntitlementService(new UnavailableStoreProvider(), new MemoryEntitlementCacheStore(), () => T);
    expect((await service.check()).premium).toBe(false);
    expect(await service.getOffer()).toBeNull();
    expect(await service.purchase()).toBe('failed');
  });
});

describe('store selection: the fake store exists only in development', () => {
  const g = globalThis as { __DEV__?: boolean };
  afterEach(() => {
    delete g.__DEV__;
  });

  it('release builds get the unavailable provider (the fake store is never constructed)', async () => {
    const { createStoreProvider } = await import('../services/entitlement/store-factory');
    g.__DEV__ = false;
    expect(createStoreProvider().id).toBe('unavailable');
    // The development branch (fake store) is verified in the real bundles: present in a
    // development bundle, absent from release bundles (see the Step 3 record).
  });
});

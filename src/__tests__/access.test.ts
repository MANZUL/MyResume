import { describe, expect, it } from 'vitest';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { UnavailableStoreProvider } from '../services/entitlement/store-provider';

// Step 1's export-access cases, ported to the Step 3 entitlement model
// (the old resolveExportAccess API was removed because it let the caller
// supply the decision). Same intent per case; see the note on the dev case.

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const service = (store: FakeStoreProvider | UnavailableStoreProvider) =>
  new EntitlementService(store, new MemoryEntitlementCacheStore(), () => NOW);

describe('entitlement decisions (ported from the Step 1 export-access policy)', () => {
  it('keeps release builds locked when purchases are not configured', async () => {
    const decision = await service(new UnavailableStoreProvider()).check();
    expect(decision).toMatchObject({ premium: false, reason: 'unverified', source: 'none' });
  });

  it('development builds no longer unlock by themselves (the old dev bypass is removed): the fake store starts FREE', async () => {
    expect((await service(new FakeStoreProvider({ storeNow: () => NOW })).check()).premium).toBe(false);
  });

  it('does not treat a development build as a bypass once a store is configured', async () => {
    const store = new FakeStoreProvider({ storeNow: () => NOW });
    expect(await service(store).isPremium()).toBe(false);
  });

  it('stays locked without an active entitlement', async () => {
    const store = new FakeStoreProvider({ storeNow: () => NOW });
    expect((await service(store).check()).reason).toBe('not_subscribed');
    store.setSubscription('expired', NOW - DAY);
    expect(await service(store).isPremium()).toBe(false);
  });

  it('rejects a subscription the store could not verify', async () => {
    const store = new FakeStoreProvider({ storeNow: () => NOW });
    store.setSubscription('unknown', NOW + DAY);
    expect(await service(store).check()).toMatchObject({ premium: false, state: 'unknown' });
  });

  it('fails closed when the store cannot be reached and nothing is cached', async () => {
    const store = new FakeStoreProvider({ storeNow: () => NOW, online: false });
    store.setSubscription('active', NOW + 30 * DAY);
    expect(await service(store).check()).toMatchObject({ premium: false, reason: 'unverified' });
  });

  it('unlocks a verified active or grace-period subscription', async () => {
    for (const state of ['active', 'grace_period'] as const) {
      const store = new FakeStoreProvider({ storeNow: () => NOW });
      store.setSubscription(state, NOW + DAY);
      expect(await service(store).check()).toMatchObject({ premium: true, reason: 'verified', state });
    }
  });
});

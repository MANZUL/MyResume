import { decodeEntitlementCache, encodeEntitlementCache } from '../../domain/entitlement/cache-codec';
import {
  advanceClock,
  cacheFromStore,
  decideFromCache,
  decideFromStore,
  type EntitlementDecision,
} from '../../domain/entitlement/policy';
import type { EntitlementCache } from '../../domain/entitlement/subscription';
import type { EntitlementCacheStore } from './cache-store';
import type { PurchaseResult, StoreOffer, StoreProvider } from './store-provider';

// The only entitlement authority inside the app. Features and services ask it;
// nobody can hand it a decision. It asks the store first and falls back to the
// offline cache only when the store cannot answer.

export type PurchaseOutcome = 'subscribed' | 'pending' | 'cancelled' | 'failed' | 'not_verified';

export interface EntitlementReader {
  check(): Promise<EntitlementDecision>;
}

export class EntitlementService implements EntitlementReader {
  private last: EntitlementDecision;
  private readonly listeners = new Set<(decision: EntitlementDecision) => void>();

  constructor(
    private readonly store: StoreProvider,
    private readonly cacheStore: EntitlementCacheStore,
    private readonly now: () => number = Date.now,
  ) {
    this.last = decideFromCache(null, store.id, now());
  }

  get providerId() {
    return this.store.id;
  }

  /** Last decision, for display only (badges, watermark hint). Never used to authorize. */
  snapshot(): EntitlementDecision {
    return this.last;
  }

  subscribe(listener: (decision: EntitlementDecision) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(decision: EntitlementDecision): EntitlementDecision {
    this.last = decision;
    for (const listener of this.listeners) listener(decision);
    return decision;
  }

  private async readCache(): Promise<EntitlementCache | null> {
    try {
      return decodeEntitlementCache(await this.cacheStore.read());
    } catch {
      return null;
    }
  }

  private async writeCache(cache: EntitlementCache): Promise<void> {
    try {
      await this.cacheStore.write(encodeEntitlementCache(cache));
    } catch {
      // The cache is UX only; failing to write it never grants anything.
    }
  }

  /** Full decision: store first, cache only when the store cannot answer. */
  async check(): Promise<EntitlementDecision> {
    const now = this.now();
    try {
      const subscription = await this.store.getVerifiedSubscription();
      await this.writeCache(cacheFromStore(subscription, this.store.id, now));
      return this.publish(decideFromStore(subscription, this.store.id, now));
    } catch {
      // The store could not give a verified answer (offline, not configured, or a
      // verification error). Fall back to the strict offline cache rules.
    }
    const cache = await this.readCache();
    const decision = decideFromCache(cache, this.store.id, now);
    if (cache && decision.reason !== 'clock_rollback') {
      const advanced = advanceClock(cache, now);
      if (advanced !== cache) await this.writeCache(advanced);
    }
    return this.publish(decision);
  }

  async isPremium(): Promise<boolean> {
    return (await this.check()).premium;
  }

  async getOffer(): Promise<StoreOffer | null> {
    try {
      return await this.store.getOffer();
    } catch {
      return null;
    }
  }

  /** Buys through the store, then re-verifies: only a verified premium state counts as subscribed. */
  async purchase(): Promise<PurchaseOutcome> {
    const offer = await this.getOffer();
    if (!offer) return 'failed';
    let result: PurchaseResult;
    try {
      result = await this.store.purchase(offer.productId);
    } catch {
      return 'failed';
    }
    if (result.kind !== 'purchased') {
      if (result.kind === 'pending') await this.check().catch(() => undefined);
      return result.kind;
    }
    const decision = await this.check();
    return decision.premium ? 'subscribed' : 'not_verified';
  }

  async restore(): Promise<EntitlementDecision> {
    const now = this.now();
    const subscription = await this.store.restore();
    await this.writeCache(cacheFromStore(subscription, this.store.id, now));
    return this.publish(decideFromStore(subscription, this.store.id, now));
  }

  /** Drops the offline cache; the next check must reach the store to grant premium. */
  async invalidateCache(): Promise<void> {
    await this.cacheStore.clear();
    this.publish(decideFromCache(null, this.store.id, this.now()));
  }
}

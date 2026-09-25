import {
  PREMIUM_STATES,
  type EntitlementCache,
  type ProviderId,
  type SubscriptionState,
  type VerifiedSubscription,
} from './subscription';

// Pure entitlement policy. The only place that decides PREMIUM vs FREE.
//
// Store answer (online): premium only for an active or grace-period
// subscription whose expiry is still in the future.
//
// Cache (offline): premium only when all of these hold:
//   - the cache comes from the current store provider;
//   - the cached state is active or grace_period;
//   - the device clock has not moved backwards (high-water mark);
//   - now < MIN(subscriptionExpiry, lastVerifiedAt + 7 days).
// Nothing extends access past the real subscription expiry.

export const OFFLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type EntitlementReason =
  | 'verified' // premium: store answer
  | 'cached' // premium: offline cache inside its window
  | 'not_subscribed' // store/cache state is not a premium state
  | 'expired' // premium state but past its expiry
  | 'cache_stale' // offline, last verification older than 7 days
  | 'clock_rollback' // offline, device clock moved backwards
  | 'unverified'; // offline with no usable cache, or no store in this build

export interface EntitlementDecision {
  premium: boolean;
  reason: EntitlementReason;
  state: SubscriptionState;
  source: 'store' | 'cache' | 'none';
  provider: ProviderId;
  expiresAt: number | null;
  lastVerifiedAt: number | null;
  /** Offline only: the moment cached premium stops counting. */
  offlineDeadline: number | null;
}

const isPremiumState = (state: SubscriptionState) => PREMIUM_STATES.includes(state);

export function offlineDeadline(cache: Pick<EntitlementCache, 'expiresAt' | 'lastVerifiedAt'>): number | null {
  if (cache.expiresAt === null) return null;
  return Math.min(cache.expiresAt, cache.lastVerifiedAt + OFFLINE_WINDOW_MS);
}

export function decideFromStore(subscription: VerifiedSubscription | null, provider: ProviderId, now: number): EntitlementDecision {
  if (!subscription) {
    return { premium: false, reason: 'not_subscribed', state: 'none', source: 'store', provider, expiresAt: null, lastVerifiedAt: now, offlineDeadline: null };
  }
  const base = {
    state: subscription.state,
    source: 'store' as const,
    provider: subscription.provider,
    expiresAt: subscription.expiresAt,
    lastVerifiedAt: subscription.verifiedAt,
    offlineDeadline: null,
  };
  if (!isPremiumState(subscription.state)) return { ...base, premium: false, reason: 'not_subscribed' };
  if (subscription.expiresAt === null || subscription.expiresAt <= now) return { ...base, premium: false, reason: 'expired' };
  return { ...base, premium: true, reason: 'verified' };
}

export function decideFromCache(cache: EntitlementCache | null, provider: ProviderId, now: number): EntitlementDecision {
  const none: EntitlementDecision = {
    premium: false, reason: 'unverified', state: 'unknown', source: 'none', provider, expiresAt: null, lastVerifiedAt: null, offlineDeadline: null,
  };
  if (!cache || cache.provider !== provider) return none;
  const base = {
    state: cache.state,
    source: 'cache' as const,
    provider: cache.provider,
    expiresAt: cache.expiresAt,
    lastVerifiedAt: cache.lastVerifiedAt,
    offlineDeadline: offlineDeadline(cache),
  };
  if (!isPremiumState(cache.state)) return { ...base, premium: false, reason: 'not_subscribed' };
  if (now < cache.clockHighWaterMark || now < cache.lastVerifiedAt) return { ...base, premium: false, reason: 'clock_rollback' };
  if (cache.expiresAt === null || now >= cache.expiresAt) return { ...base, premium: false, reason: 'expired' };
  if (now >= cache.lastVerifiedAt + OFFLINE_WINDOW_MS) return { ...base, premium: false, reason: 'cache_stale' };
  return { ...base, premium: true, reason: 'cached' };
}

/** The cache written after a store answer. Never stores a premium boolean. */
export function cacheFromStore(
  subscription: VerifiedSubscription | null,
  provider: ProviderId,
  now: number,
): EntitlementCache {
  return {
    version: 1,
    provider: subscription?.provider ?? provider,
    productId: subscription?.productId ?? '',
    state: subscription?.state ?? 'none',
    expiresAt: subscription?.expiresAt ?? null,
    lastVerifiedAt: subscription?.verifiedAt ?? now,
    // A store answer re-anchors the clock guard to the later of device time and store time.
    clockHighWaterMark: Math.max(now, subscription?.verifiedAt ?? now),
  };
}

/** Advances the clock guard; it never moves backwards. */
export function advanceClock(cache: EntitlementCache, now: number): EntitlementCache {
  return now > cache.clockHighWaterMark ? { ...cache, clockHighWaterMark: now } : cache;
}

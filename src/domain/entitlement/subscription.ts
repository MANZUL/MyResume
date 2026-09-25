// Vendor-neutral subscription model (plan §4.4). No Apple, Google, RevenueCat
// or Dodo types appear anywhere in the app outside a store provider.

export const PREMIUM_ENTITLEMENT_ID = 'premium';

export const PREMIUM_PRICE = { amount: '$7.99', period: 'month', label: 'Premium — $7.99/month' } as const;

export const SUBSCRIPTION_STATES = [
  'active', // paid, before expiry (auto-renew on or off)
  'grace_period', // billing problem, the store still grants access until the grace expiry
  'billing_retry', // billing problem without grace
  'account_hold', // Google Play account hold
  'paused', // Google Play pause
  'pending', // Ask to Buy / deferred payment, not approved yet
  'expired',
  'refunded', // refunded or revoked by the store
  'none', // the store answered: no subscription for this account
  'unknown', // unrecognized or unverifiable state
] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

/** Only these states can ever grant premium, and only before their expiry. */
export const PREMIUM_STATES: readonly SubscriptionState[] = ['active', 'grace_period'];

export type ProviderId = 'app_store' | 'google_play' | 'fake' | 'unavailable';

/** What a store provider reports after the store itself verified the purchase. */
export interface VerifiedSubscription {
  provider: ProviderId;
  productId: string;
  state: SubscriptionState;
  /** End of the paid period, or of the grace period when state is grace_period. */
  expiresAt: number | null;
  /** When the store verified this state (store-signed time where available, not the device clock). */
  verifiedAt: number;
  willRenew: boolean;
}

/**
 * Offline UX cache of the last store-verified state. It is never a grant on its
 * own: it only counts inside the offline window (policy.ts) and is overwritten
 * by every store answer.
 */
export interface EntitlementCache {
  version: 1;
  provider: ProviderId;
  productId: string;
  state: SubscriptionState;
  expiresAt: number | null;
  lastVerifiedAt: number;
  /** Latest device time seen; the clock going below it means the clock was moved back. */
  clockHighWaterMark: number;
}

export function isSubscriptionState(value: unknown): value is SubscriptionState {
  return typeof value === 'string' && (SUBSCRIPTION_STATES as readonly string[]).includes(value);
}

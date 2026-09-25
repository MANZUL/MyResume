import type { ProviderId, VerifiedSubscription } from '../../domain/entitlement/subscription';

// Interface every store integration implements (Apple App Store, Google Play,
// later, after separate approval). Nothing outside services/entitlement sees it.

export class StoreUnavailableError extends Error {
  constructor(message = 'The store could not be reached.') {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

export interface StoreOffer {
  productId: string;
  /** Localized by the store. */
  priceString: string;
  period: 'month';
}

export type PurchaseResult =
  | { kind: 'purchased' }
  | { kind: 'pending' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface StoreProvider {
  readonly id: ProviderId;
  /**
   * The store-verified subscription for the signed-in store account, or null
   * when the store verified that there is none. Throws StoreUnavailableError
   * when the store cannot answer (offline, not configured).
   */
  getVerifiedSubscription(): Promise<VerifiedSubscription | null>;
  getOffer(): Promise<StoreOffer | null>;
  purchase(productId: string): Promise<PurchaseResult>;
  /** Asks the store to re-sync purchases (may show a store sign-in). */
  restore(): Promise<VerifiedSubscription | null>;
}

/** Release builds until real billing is approved: never verifies anything, so users stay FREE. */
export class UnavailableStoreProvider implements StoreProvider {
  readonly id = 'unavailable' as const;
  async getVerifiedSubscription(): Promise<VerifiedSubscription | null> {
    throw new StoreUnavailableError('In-app purchases are not available in this build.');
  }
  async getOffer(): Promise<StoreOffer | null> {
    return null;
  }
  async purchase(): Promise<PurchaseResult> {
    return { kind: 'failed', message: 'In-app purchases are not available in this build.' };
  }
  async restore(): Promise<VerifiedSubscription | null> {
    throw new StoreUnavailableError('In-app purchases are not available in this build.');
  }
}

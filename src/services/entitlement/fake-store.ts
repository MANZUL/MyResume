import { PREMIUM_PRICE, type SubscriptionState, type VerifiedSubscription } from '../../domain/entitlement/subscription';
import { StoreUnavailableError, type PurchaseResult, type StoreOffer, type StoreProvider } from './store-provider';

// DEVELOPMENT AND TEST ONLY. Simulates a store so every subscription state can
// be exercised without Apple or Google. It is loaded only behind __DEV__
// (store-factory.ts), so release bundles do not contain it.

export const FAKE_PRODUCT_ID = 'dev.fake.premium.monthly';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface FakeStoreOptions {
  /** The "store's" clock (store-signed time). Independent of the device clock. */
  storeNow?: () => number;
  online?: boolean;
}

export class FakeStoreProvider implements StoreProvider {
  readonly id = 'fake' as const;
  online: boolean;
  private subscription: VerifiedSubscription | null = null;
  private nextPurchase: PurchaseResult = { kind: 'purchased' };
  private readonly storeNow: () => number;
  calls = { verify: 0, purchase: 0, restore: 0 };

  constructor(options: FakeStoreOptions = {}) {
    this.storeNow = options.storeNow ?? Date.now;
    this.online = options.online ?? true;
  }

  // --- scripting API (tests and development only) ---

  setSubscription(state: SubscriptionState, expiresAt: number | null, willRenew = state === 'active'): void {
    this.subscription = { provider: 'fake', productId: FAKE_PRODUCT_ID, state, expiresAt, verifiedAt: 0, willRenew };
  }

  clearSubscription(): void {
    this.subscription = null;
  }

  /** The result the next purchase() returns. A 'purchased' result activates a 30-day subscription. */
  setNextPurchaseResult(result: PurchaseResult): void {
    this.nextPurchase = result;
  }

  /** Completes a pending (Ask to Buy) purchase, as the store would later. */
  approvePending(): void {
    if (this.subscription?.state === 'pending') this.setSubscription('active', this.storeNow() + MONTH_MS);
  }

  refund(): void {
    if (this.subscription) this.setSubscription('refunded', this.subscription.expiresAt, false);
  }

  // --- StoreProvider ---

  private requireOnline() {
    if (!this.online) throw new StoreUnavailableError();
  }

  async getVerifiedSubscription(): Promise<VerifiedSubscription | null> {
    this.calls.verify += 1;
    this.requireOnline();
    return this.subscription ? { ...this.subscription, verifiedAt: this.storeNow() } : null;
  }

  async getOffer(): Promise<StoreOffer | null> {
    this.requireOnline();
    return { productId: FAKE_PRODUCT_ID, priceString: PREMIUM_PRICE.amount, period: 'month' };
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    this.calls.purchase += 1;
    this.requireOnline();
    if (productId !== FAKE_PRODUCT_ID) return { kind: 'failed', message: 'Unknown product.' };
    const result = this.nextPurchase;
    if (result.kind === 'purchased') this.setSubscription('active', this.storeNow() + MONTH_MS);
    if (result.kind === 'pending') this.setSubscription('pending', null, false);
    return result;
  }

  async restore(): Promise<VerifiedSubscription | null> {
    this.calls.restore += 1;
    return this.getVerifiedSubscription();
  }
}

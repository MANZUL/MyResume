import type { PremiumFeature } from '../../domain/entitlement/features';
import type { EntitlementService, PurchaseOutcome } from './entitlement-service';

// Remembers the premium action that opened the paywall and runs it again after
// a successful subscription. The resumed action goes through its own premium
// checks again; the paywall never grants anything itself.

export interface PendingAction {
  feature: PremiumFeature;
  run: () => Promise<void>;
}

export class PaywallCoordinator {
  private pending: PendingAction | null = null;
  private readonly listeners = new Set<(feature: PremiumFeature) => void>();

  constructor(private readonly entitlements: EntitlementService) {}

  /** Called when a premium action was refused: remember it and ask the UI to show the paywall. */
  request(action: PendingAction): void {
    this.pending = action;
    for (const listener of this.listeners) listener(action.feature);
  }

  onRequest(listener: (feature: PremiumFeature) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  pendingFeature(): PremiumFeature | null {
    return this.pending?.feature ?? null;
  }

  /**
   * Subscribes through the store. On success, returns the remembered action so
   * the caller can close the paywall first and then run it.
   */
  async subscribe(): Promise<{ outcome: PurchaseOutcome; resume: (() => Promise<void>) | null }> {
    const outcome = await this.entitlements.purchase();
    if (outcome !== 'subscribed') return { outcome, resume: null };
    const action = this.pending;
    this.pending = null;
    return { outcome, resume: action ? action.run : null };
  }

  async restore(): Promise<{ premium: boolean; resume: (() => Promise<void>) | null }> {
    const decision = await this.entitlements.restore();
    if (!decision.premium) return { premium: false, resume: null };
    const action = this.pending;
    this.pending = null;
    return { premium: true, resume: action ? action.run : null };
  }

  dismiss(): void {
    this.pending = null;
  }
}

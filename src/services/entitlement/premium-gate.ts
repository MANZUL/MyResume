import { PremiumRequiredError, type PremiumFeature } from '../../domain/entitlement/features';
import type { EntitlementDecision } from '../../domain/entitlement/policy';
import type { EntitlementReader } from './entitlement-service';

// Premium features call this themselves. The decision always comes from the
// EntitlementService; no caller can supply one.

export class PremiumGate {
  constructor(private readonly entitlements: EntitlementReader) {}

  /** Returns the decision when premium; throws PremiumRequiredError otherwise. */
  async require(feature: PremiumFeature): Promise<EntitlementDecision> {
    const decision = await this.entitlements.check();
    if (!decision.premium) throw new PremiumRequiredError(feature);
    return decision;
  }

  async allows(): Promise<boolean> {
    return (await this.entitlements.check()).premium;
  }
}

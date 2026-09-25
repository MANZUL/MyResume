import { router } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { EntitlementDecision } from '../../domain/entitlement/policy';
import { PremiumTools } from '../premium/premium-tools';
import { PreviewService } from '../preview/preview-service';
import { EntitlementService } from './entitlement-service';
import { createDeviceEntitlementCacheStore } from '../storage/entitlement-cache-kv';
import { PaywallCoordinator } from './paywall';
import { PremiumGate } from './premium-gate';
import { createStoreProvider } from './store-factory';
import type { StoreOffer } from './store-provider';

// App-wide access to the single EntitlementService and the services that
// depend on it. Screens read `decision` for display only; every premium
// action is authorized inside its service.

interface EntitlementContextValue {
  decision: EntitlementDecision;
  offer: StoreOffer | null;
  entitlements: EntitlementService;
  gate: PremiumGate;
  paywall: PaywallCoordinator;
  preview: PreviewService;
  tools: PremiumTools;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => {
    const entitlements = new EntitlementService(createStoreProvider(), createDeviceEntitlementCacheStore());
    const gate = new PremiumGate(entitlements);
    return {
      entitlements,
      gate,
      paywall: new PaywallCoordinator(entitlements),
      preview: new PreviewService(entitlements),
      tools: new PremiumTools(gate),
    };
  }, []);
  const [decision, setDecision] = useState<EntitlementDecision>(() => services.entitlements.snapshot());
  const [offer, setOffer] = useState<StoreOffer | null>(null);

  useEffect(() => {
    const { entitlements, paywall } = services;
    const unsubscribe = entitlements.subscribe(setDecision);
    const refresh = () => {
      void entitlements.check().catch(() => undefined);
      void entitlements.getOffer().then(setOffer);
    };
    refresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const stopPaywall = paywall.onRequest(() => router.push('/unlock'));
    return () => {
      unsubscribe();
      appState.remove();
      stopPaywall();
    };
  }, [services]);

  const value = useMemo(() => ({ ...services, decision, offer }), [services, decision, offer]);
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementContextValue {
  const value = useContext(EntitlementContext);
  if (!value) throw new Error('useEntitlement must be used inside EntitlementProvider');
  return value;
}

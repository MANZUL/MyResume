import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolveExportAccess, type ExportAccess } from '../../domain/access/access';

// Vendor-neutral entitlement boundary. The app never imports a billing SDK
// directly; store providers (Apple App Store / Google Play) plug in here in a
// later migration step (plan §4.4, §19 step 3 and step 11).
//
// Until a provider exists, billing is "not configured". The policy in
// domain/access keeps release builds locked (fail closed) and unlocks only
// development builds, which is the same behavior the prototype had with no
// store keys.

const BILLING_CONFIGURED = false;

export interface StoreOffer {
  priceString: string;
}

interface EntitlementState {
  access: ExportAccess;
  loading: boolean;
  offer: StoreOffer | null;
  purchase: () => Promise<'purchased' | 'cancelled'>;
  restore: () => Promise<boolean>;
}

const EntitlementContext = createContext<EntitlementState | null>(null);

const notConfigured = async (): Promise<never> => {
  throw new Error('In-app purchases are not set up for this build.');
};

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const value = useMemo<EntitlementState>(
    () => ({
      access: resolveExportAccess({ configured: BILLING_CONFIGURED, isDev: __DEV__ }),
      loading: false,
      offer: null,
      purchase: notConfigured,
      restore: notConfigured,
    }),
    [],
  );
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement(): EntitlementState {
  const value = useContext(EntitlementContext);
  if (!value) throw new Error('useEntitlement must be used inside EntitlementProvider');
  return value;
}

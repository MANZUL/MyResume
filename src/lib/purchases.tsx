import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import { EXPORT_ENTITLEMENT_ID, resolveExportAccess, type ExportAccess } from './access';

// Native in-app purchase for the export unlock. App Store and Google Play rules
// require their own billing for unlocking digital features inside an app, so the
// web app's Dodo checkout is not used here.

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
}) ?? '';

const CONFIGURED = API_KEY.length > 0;

interface PurchasesState {
  access: ExportAccess;
  loading: boolean;
  exportPackage: PurchasesPackage | null;
  purchase: () => Promise<'purchased' | 'cancelled'>;
  restore: () => Promise<boolean>;
}

const PurchasesContext = createContext<PurchasesState | null>(null);

let configuredOnce = false;

function accessFrom(info: CustomerInfo | null, error = false): ExportAccess {
  const entitlement = info?.entitlements.all[EXPORT_ENTITLEMENT_ID];
  return resolveExportAccess({
    configured: CONFIGURED,
    isDev: __DEV__,
    error,
    entitlement: entitlement
      ? { isActive: entitlement.isActive, verification: entitlement.verification }
      : null,
  });
}

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<ExportAccess>(() => accessFrom(null));
  const [loading, setLoading] = useState(CONFIGURED);
  const [exportPackage, setExportPackage] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    if (!CONFIGURED) return;
    if (!configuredOnce) {
      Purchases.configure({
        apiKey: API_KEY,
        entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      });
      configuredOnce = true;
    }
    const listener = (info: CustomerInfo) => setAccess(accessFrom(info));
    Purchases.addCustomerInfoUpdateListener(listener);

    let active = true;
    (async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        if (active) setAccess(accessFrom(info));
      } catch {
        if (active) setAccess(accessFrom(null, true));
      }
      try {
        const offerings = await Purchases.getOfferings();
        if (active) setExportPackage(offerings.current?.availablePackages[0] ?? null);
      } catch {
        // Offerings are only needed for the paywall; it shows its own error.
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const purchase = useCallback(async () => {
    if (!CONFIGURED) throw new Error('In-app purchases are not set up for this build.');
    if (!exportPackage) throw new Error('The store is unavailable right now. Please try again shortly.');
    try {
      const { customerInfo } = await Purchases.purchasePackage(exportPackage);
      const next = accessFrom(customerInfo);
      setAccess(next);
      if (!next.unlocked) throw new Error('The purchase could not be verified. Try "Restore purchases".');
      return 'purchased' as const;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'userCancelled' in error && error.userCancelled) {
        return 'cancelled' as const;
      }
      throw error;
    }
  }, [exportPackage]);

  const restore = useCallback(async () => {
    if (!CONFIGURED) throw new Error('In-app purchases are not set up for this build.');
    const info = await Purchases.restorePurchases();
    const next = accessFrom(info);
    setAccess(next);
    return next.unlocked;
  }, []);

  const value = useMemo(
    () => ({ access, loading, exportPackage, purchase, restore }),
    [access, loading, exportPackage, purchase, restore],
  );
  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): PurchasesState {
  const value = useContext(PurchasesContext);
  if (!value) throw new Error('usePurchases must be used inside PurchasesProvider');
  return value;
}

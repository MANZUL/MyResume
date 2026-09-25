// Pure export-access policy, kept free of React Native imports so it is unit-tested.
//
// Rules (fail closed):
// - Access comes only from an active, store-verified entitlement reported by the
//   entitlement service's store provider (App Store / Google Play).
// - An entitlement whose signature FAILED verification (tampered / MiTM) never
//   unlocks exports.
// - If purchases are not configured, a release build stays locked. Only a
//   development build (__DEV__) unlocks, so the app is testable before store setup.
// - There is no local "isPro" flag in storage that a user could edit.

export const EXPORT_ENTITLEMENT_ID = 'exports';

export type AccessReason =
  | 'entitled'
  | 'dev-unconfigured'
  | 'not-configured'
  | 'not-purchased'
  | 'verification-failed'
  | 'error';

export interface ExportAccess {
  unlocked: boolean;
  reason: AccessReason;
}

export interface EntitlementSnapshot {
  isActive: boolean;
  verification: 'NOT_REQUESTED' | 'VERIFIED' | 'VERIFIED_ON_DEVICE' | 'FAILED' | string;
}

export function resolveExportAccess(input: {
  configured: boolean;
  isDev: boolean;
  entitlement?: EntitlementSnapshot | null;
  error?: boolean;
}): ExportAccess {
  if (!input.configured) {
    return input.isDev
      ? { unlocked: true, reason: 'dev-unconfigured' }
      : { unlocked: false, reason: 'not-configured' };
  }
  if (input.error) return { unlocked: false, reason: 'error' };
  const entitlement = input.entitlement;
  if (!entitlement || !entitlement.isActive) return { unlocked: false, reason: 'not-purchased' };
  if (entitlement.verification === 'FAILED') return { unlocked: false, reason: 'verification-failed' };
  return { unlocked: true, reason: 'entitled' };
}

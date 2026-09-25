import { isSubscriptionState, type EntitlementCache, type ProviderId } from './subscription';

// Strict parsing of the stored cache. Anything malformed is treated as "no
// cache" (FREE until the store answers), never repaired into a grant.

const PROVIDERS: readonly ProviderId[] = ['app_store', 'google_play', 'fake', 'unavailable'];
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function encodeEntitlementCache(cache: EntitlementCache): string {
  return JSON.stringify(cache);
}

export function decodeEntitlementCache(raw: string | null): EntitlementCache | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return null;
  if (!PROVIDERS.includes(v.provider as ProviderId)) return null;
  if (!isSubscriptionState(v.state)) return null;
  if (typeof v.productId !== 'string') return null;
  if (!(v.expiresAt === null || isTime(v.expiresAt))) return null;
  if (!isTime(v.lastVerifiedAt) || !isTime(v.clockHighWaterMark)) return null;
  return {
    version: 1,
    provider: v.provider as ProviderId,
    productId: v.productId,
    state: v.state,
    expiresAt: v.expiresAt as number | null,
    lastVerifiedAt: v.lastVerifiedAt,
    clockHighWaterMark: v.clockHighWaterMark,
  };
}

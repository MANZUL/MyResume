import { describe, expect, it } from 'vitest';
import { resolveExportAccess } from '../lib/access';

describe('resolveExportAccess (payment verification)', () => {
  it('keeps release builds locked when purchases are not configured', () => {
    expect(resolveExportAccess({ configured: false, isDev: false })).toEqual({ unlocked: false, reason: 'not-configured' });
  });

  it('only unlocks unconfigured purchases in development builds', () => {
    expect(resolveExportAccess({ configured: false, isDev: true })).toEqual({ unlocked: true, reason: 'dev-unconfigured' });
  });

  it('does not treat dev mode as a bypass once purchases are configured', () => {
    expect(resolveExportAccess({ configured: true, isDev: true, entitlement: null }).unlocked).toBe(false);
  });

  it('stays locked without an active entitlement', () => {
    expect(resolveExportAccess({ configured: true, isDev: false, entitlement: null }).reason).toBe('not-purchased');
    expect(
      resolveExportAccess({ configured: true, isDev: false, entitlement: { isActive: false, verification: 'VERIFIED' } }).unlocked,
    ).toBe(false);
  });

  it('rejects an active entitlement whose signature failed verification', () => {
    expect(
      resolveExportAccess({ configured: true, isDev: false, entitlement: { isActive: true, verification: 'FAILED' } }),
    ).toEqual({ unlocked: false, reason: 'verification-failed' });
  });

  it('fails closed when the store cannot be reached and nothing is cached', () => {
    expect(resolveExportAccess({ configured: true, isDev: false, error: true }).unlocked).toBe(false);
  });

  it('unlocks a verified active entitlement', () => {
    for (const verification of ['VERIFIED', 'VERIFIED_ON_DEVICE']) {
      expect(
        resolveExportAccess({ configured: true, isDev: false, entitlement: { isActive: true, verification } }),
      ).toEqual({ unlocked: true, reason: 'entitled' });
    }
  });
});

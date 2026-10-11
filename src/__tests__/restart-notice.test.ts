import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Language } from '../domain/i18n/languages';
import { restartNoticeVisible } from '../services/i18n/restart-notice';
import { ar } from '../i18n/messages/ar';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';

// Phase 17: the restart notice. React Native applies a layout-direction change only after the
// app is reopened, so when the direction must change (first launch on an Arabic device, or a
// language switch) the user is told, on any screen, once; the app never restarts itself.

const native = vi.hoisted(() => ({ isRTL: false, calls: [] as string[], throwOnForce: false }));
vi.mock('react-native', () => ({
  I18nManager: {
    get isRTL() {
      return native.isRTL;
    },
    allowRTL: (value: boolean) => void native.calls.push(`allowRTL(${value})`),
    forceRTL: (value: boolean) => {
      if (native.throwOnForce) throw new Error('native module missing');
      native.calls.push(`forceRTL(${value})`);
    },
  },
}));

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('when a restart is required (existing layout-direction logic)', () => {
  beforeEach(() => {
    native.isRTL = false;
    native.calls.length = 0;
    native.throwOnForce = false;
  });
  const apply = async (language: Language) => (await import('../services/i18n/layout-direction')).applyLayoutDirection(language);

  it('first launch on an Arabic device whose layout is still left-to-right: a restart is required', async () => {
    expect(await apply('ar')).toEqual({ restartRequired: true });
    expect(native.calls).toEqual(['allowRTL(true)', 'forceRTL(true)']);
  });

  it('after the user reopened the app (the layout is right-to-left now): no restart is required, so the notice is gone', async () => {
    native.isRTL = true;
    expect(await apply('ar')).toEqual({ restartRequired: false });
  });

  it('switching to a left-to-right language from Arabic requires a restart; the same direction does not', async () => {
    native.isRTL = true;
    expect(await apply('de')).toEqual({ restartRequired: true });
    expect(native.calls).toContain('forceRTL(false)');
    native.isRTL = false;
    for (const language of ['en', 'de', 'fr', 'es'] as const) expect(await apply(language)).toEqual({ restartRequired: false });
  });

  it('a platform without the native module reports no restart (it never claims one it cannot do)', async () => {
    native.throwOnForce = true;
    expect(await apply('ar')).toEqual({ restartRequired: false });
  });

  it('calling it again does not change the outcome: no loop is created by repeated calls', async () => {
    const first = await apply('ar');
    const second = await apply('ar');
    expect(second).toEqual(first);
  });
});

describe('who sees the notice, and when', () => {
  const base = { restartPending: true, appLanguage: 'ar' as Language, dismissedFor: null, onLanguageScreen: false };

  it('shows on any screen while a restart is pending (the first-launch Arabic case)', () => {
    expect(restartNoticeVisible(base)).toBe(true);
  });

  it('is not shown when nothing is pending, which is the state after the app was reopened', () => {
    expect(restartNoticeVisible({ ...base, restartPending: false })).toBe(false);
  });

  it('can be dismissed for the current language, and returns for a later language change that needs a restart', () => {
    expect(restartNoticeVisible({ ...base, dismissedFor: 'ar' })).toBe(false);
    expect(restartNoticeVisible({ ...base, appLanguage: 'en', dismissedFor: 'ar' })).toBe(true);
  });

  it('is hidden on the Language screen, which shows the same message inline', () => {
    expect(restartNoticeVisible({ ...base, onLanguageScreen: true })).toBe(false);
    expect(read('features/settings/LanguageSettingsScreen.tsx')).toMatch(/restartPending \? <Muted>\{t\('settings\.restart'\)\}<\/Muted> : null/);
  });
});

describe('the notice component and its wiring', () => {
  it('is mounted once, above every screen, inside the localization provider', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/<RestartNotice \/>/);
    expect(layout.indexOf('<LocalizationProvider>')).toBeLessThan(layout.indexOf('<RestartNotice />'));
  });

  it('uses the catalog message in the app language, dismisses per language, and never restarts or reloads the app', () => {
    const notice = read('ui/RestartNotice.tsx');
    expect(notice).toMatch(/t\('settings\.restart'\)/);
    expect(notice).toMatch(/setDismissedFor\(appLanguage\)/);
    expect(notice).toMatch(/accessibilityRole="alert"/);
    for (const file of ['ui/RestartNotice.tsx', 'services/i18n/restart-notice.ts', 'services/i18n/layout-direction.ts']) {
      expect(read(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''), file).not.toMatch(/reloadAsync|DevSettings|\bUpdates\b|RNRestart|restartApp|BackHandler\.exitApp|reload\(/);
    }
  });

  it('the provider still computes the notice from the layout direction and keeps explicit language selection as it was', () => {
    const provider = read('services/i18n/localization.tsx');
    expect(provider).toMatch(/const \{ restartRequired \} = applyLayoutDirection\(language\);/);
    expect(provider).toMatch(/restartPending: restartRequired/);
    expect(provider).toMatch(/await settings\.setAppLanguage\(language\);/);
  });

  it('the message exists in all five languages and says to close and reopen the app (it does not claim a restart)', () => {
    for (const [language, catalog] of Object.entries({ en, de, fr, es, ar })) {
      expect(catalog.settings.restart.length, language).toBeGreaterThan(15);
    }
    expect(en.settings.restart).toBe('Close and reopen the app to switch the layout direction.');
    expect(ar.settings.restart).toBe('أغلق التطبيق وأعد فتحه لتبديل اتجاه التخطيط.');
    expect(de.settings.restart).toMatch(/schließen/i);
    expect(fr.settings.restart).toMatch(/Fermez/);
    expect(es.settings.restart).toMatch(/Cierra/);
  });

  it('app language and resume language stay independent: the notice reads only the app language', () => {
    const notice = read('ui/RestartNotice.tsx');
    expect(notice).not.toMatch(/useResume|resume\.language|StoredResume/);
  });
});

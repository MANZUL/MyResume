import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../domain/i18n/languages';

// Phase 17: native configuration. These checks read app.json and the locale files, so the
// five supported languages cannot silently stop being declared to iOS and Android. The
// generated native projects were also checked once with `expo prebuild` (see the plan, 19.15).

const ROOT = join(__dirname, '..', '..');
const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;
const FIVE = ['en', 'de', 'fr', 'es', 'ar'];

describe('native localization config', () => {
  it('the five supported languages are the app\'s languages', () => {
    expect([...LANGUAGES].sort()).toEqual([...FIVE].sort());
  });

  it('iOS: CFBundleLocalizations lists exactly the five languages', () => {
    expect(app.ios.infoPlist.CFBundleLocalizations).toEqual(FIVE);
    // The other Info.plist entry is untouched.
    expect(app.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('Expo "locales": one file per language, so iOS gets <lang>.lproj/InfoPlist.strings and Android values-b+<lang>/strings.xml', () => {
    expect(Object.keys(app.locales).sort()).toEqual([...FIVE].sort());
    for (const language of FIVE) {
      expect(app.locales[language]).toBe(`./locales/${language}.json`);
      const path = join(ROOT, 'locales', `${language}.json`);
      expect(existsSync(path), path).toBe(true);
      const locale = JSON.parse(readFileSync(path, 'utf8'));
      // Only the app name, and it stays the brand name in every language.
      expect(locale).toEqual({ ios: { CFBundleDisplayName: 'My Resume' }, android: { app_name: 'My Resume' } });
    }
  });

  it('uses only mechanisms the installed Expo SDK declares', () => {
    const types = readFileSync(join(ROOT, 'node_modules', '@expo', 'config-types', 'build', 'ExpoConfig.d.ts'), 'utf8');
    expect(types).toMatch(/\n\s{4}locales\?: \{/);
    expect(types).toMatch(/infoPlist\?: \{/);
    // The generating config plugins exist in the installed SDK.
    for (const file of ['ios/Locales.js', 'android/Locales.js']) {
      expect(existsSync(join(ROOT, 'node_modules', '@expo', 'config-plugins', 'build', file)), file).toBe(true);
    }
  });

  it('the app and resume language selection code is unchanged: the language screen still lists the same languages', () => {
    const screen = readFileSync(join(ROOT, 'src', 'features', 'settings', 'LanguageSettingsScreen.tsx'), 'utf8');
    expect(screen).toMatch(/LANGUAGES\.map/);
    expect(screen).toMatch(/setAppLanguage\(language\)/);
  });
});

describe('tablet decision', () => {
  it('iPad support is OFF: the layouts are phone layouts and no tablet layout was designed or validated', () => {
    expect(app.ios.supportsTablet).toBe(false);
    // The reason, checked: no screen reads the window size or limits its content width for large screens.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [join(dir, entry.name)] : [],
      );
    for (const file of [...walk(join(ROOT, 'src', 'features')), ...walk(join(ROOT, 'src', 'app'))]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/useWindowDimensions|Dimensions\.get|isTablet/);
    }
  });
});

describe('identity and linkage are unchanged', () => {
  it('package ids, name, scheme, owner and EAS project', () => {
    expect(app.name).toBe('My Resume');
    expect(app.slug).toBe('my-resume');
    expect(app.scheme).toBe('myresume');
    expect(app.version).toBe('1.0.0');
    expect(app.ios.bundleIdentifier).toBe('com.manzul.myresume');
    expect(app.android.package).toBe('com.manzul.myresume');
    expect(app.owner).toBe('snln');
    expect(app.extra.eas.projectId).toBe('b6228382-fccd-4ffb-a501-0d1da73af85f');
    expect(app.android.blockedPermissions).toEqual([
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ]);
  });

  it('eas.json is unchanged', () => {
    const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production).toEqual({ autoIncrement: true });
  });
});

describe('release hardening (phase 20)', () => {
  it('Android OS backup is off: resume data is only copied by the explicit JSON backup', () => {
    expect(app.android.allowBackup).toBe(false);
  });

  it('the app declares no network-capable or media permissions beyond what the SDK adds, and blocks the unused ones', () => {
    const blocked: string[] = app.android.blockedPermissions;
    // File access goes through the system picker/share sheet and the app cache; no legacy storage permission is needed.
    expect(blocked).toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(blocked).toContain('android.permission.WRITE_EXTERNAL_STORAGE');
    expect(app.android.permissions).toBeUndefined();
  });

  it('expo-dev-client is not a config plugin (the SDK applies its plugin only through autolinking, debug-only)', () => {
    expect(JSON.stringify(app.plugins)).not.toContain('expo-dev-client');
  });

  it('no over-the-air update service is configured (expo-updates is not installed)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies['expo-updates']).toBeUndefined();
    expect(app.updates).toBeUndefined();
    expect(app.runtimeVersion).toBeUndefined();
  });
});

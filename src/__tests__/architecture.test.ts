import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards for the mobile-only architecture (MOBILE_ONLY_ARCHITECTURE_PLAN.md §2, step 1).

const SRC = join(__dirname, '..');
const ROOT = join(SRC, '..');

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
  expo: { android?: { permissions?: string[] }; plugins?: unknown[] };
};

const REMOVED_PACKAGES = [
  'react-native-purchases',
  '@revenuecat/purchases-typescript-internal',
  '@react-native-async-storage/async-storage',
  'react-dom',
  'react-native-web',
];

describe('mobile-only dependency graph', () => {
  it('declares none of the removed web, billing or AsyncStorage packages', () => {
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const name of REMOVED_PACKAGES) expect(declared, name).not.toContain(name);
  });

  it('never imports RevenueCat, AsyncStorage or web-only React packages', () => {
    for (const file of sourceFiles()) {
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        expect(spec, relative(SRC, file)).not.toMatch(
          /^(react-native-purchases|@revenuecat\/|@react-native-async-storage\/|(react-dom|react-native-web)(\/|$))/,
        );
      }
    }
  });

  it('requests no billing permission and has no web configuration', () => {
    const permissions = appJson.expo.android?.permissions ?? [];
    expect(permissions.join(' ')).not.toMatch(/BILLING/i);
    expect(appJson.expo).not.toHaveProperty('web');
  });
});

describe('layering', () => {
  it('keeps domain/ pure: no React, React Native, Expo, services, features or ui imports', () => {
    const domainFiles = sourceFiles(join(SRC, 'domain'));
    expect(domainFiles.length).toBeGreaterThan(5);
    for (const file of domainFiles) {
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        expect(spec, relative(SRC, file)).not.toMatch(/^(react|react-native|expo)(\/|-|$)|\/(services|features|ui)\//);
      }
    }
  });

  it('keeps app/ route files thin (re-export a feature screen, or the root layout)', () => {
    for (const file of sourceFiles(join(SRC, 'app'))) {
      if (file.endsWith(`${sep}_layout.tsx`)) continue;
      expect(readFileSync(file, 'utf8').trim(), relative(SRC, file)).toMatch(
        /^export \{ default \} from '[./]+\/features\/[\w-]+\/\w+';$/,
      );
    }
  });

  it('only the entitlement service owns purchase state', () => {
    for (const file of sourceFiles()) {
      if (file.includes(`${sep}services${sep}entitlement${sep}`)) continue;
      expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(/\bPurchases\.|purchasePackage|getCustomerInfo/);
    }
  });
});

describe('core features work without a network', () => {
  it('app source has no network APIs or remote URLs outside of text-pattern parsing', () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(SRC, file)).not.toMatch(/\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|axios/);
      // http(s) may appear only inside regular expressions that recognize links in resume text.
      for (const line of source.split('\n')) {
        if (/https?:\/\//.test(line)) expect(line, relative(SRC, file)).toMatch(/https\?:\\\/\\\//);
      }
    }
  });

  it('storage is on-device SQLite behind repository ports', () => {
    const device = readFileSync(join(SRC, 'services', 'storage', 'expo-database.ts'), 'utf8');
    expect(device).toMatch(/from 'expo-sqlite'/);
    expect(pkg.dependencies).toHaveProperty('expo-sqlite');
    // Only services/storage may talk to SQLite; features use the repositories.
    for (const file of sourceFiles()) {
      if (file.includes(`${sep}services${sep}storage${sep}`)) continue;
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        expect(spec, relative(SRC, file)).not.toMatch(/^expo-sqlite|\/storage\/sqlite\//);
      }
    }
  });
});

describe('export records cannot grant access', () => {
  it('the export path only appends records and never reads them', () => {
    for (const file of sourceFiles(join(SRC, 'services', 'export'))) {
      expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(/listRecent|listForResume|export_records/);
    }
  });

  it('no source file stores an export file path in the database', () => {
    const schema = readFileSync(join(SRC, 'services', 'storage', 'sqlite', 'schema.ts'), 'utf8');
    const exportTable = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS export_records'));
    expect(exportTable.slice(0, exportTable.indexOf(')`'))).not.toMatch(/path|uri|file/i);
  });
});

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
      // Vendored pdf.js (generated on install) is checked separately: see "image export boundary".
      if (file.endsWith('.generated.ts')) continue;
      const source = readFileSync(file, 'utf8');
      expect(source, relative(SRC, file)).not.toMatch(/\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|axios/);
      // http(s) may appear only inside regular expressions that recognize links in resume text,
      // or as the SVG XML namespace name (an identifier that is never fetched).
      for (const line of source.split('\n')) {
        const withoutSvgNamespace = line.replace("xmlns='http://www.w3.org/2000/svg'", '');
        if (/https?:\/\//.test(withoutSvgNamespace)) expect(withoutSvgNamespace, relative(SRC, file)).toMatch(/https\?:\\\/\\\//);
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

describe('entitlement architecture (step 3)', () => {
  const BILLING_SDKS = /^(react-native-purchases|@revenuecat\/|react-native-iap|expo-iap|expo-in-app-purchases|react-native-billing|@react-native-google-play|react-native-google-play-billing|dodopayments|dodo-payments|@dodopayments\/|stripe|@stripe\/)/;

  it('no real billing SDK is declared or imported', () => {
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) expect(name).not.toMatch(BILLING_SDKS);
    for (const file of sourceFiles()) {
      for (const spec of importsOf(readFileSync(file, 'utf8'))) expect(spec, relative(SRC, file)).not.toMatch(BILLING_SDKS);
    }
  });

  it('the fake store is only reachable through the development branch of the store factory', () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      if (!/fake-store/.test(source)) continue;
      expect(relative(SRC, file)).toBe(join('services', 'entitlement', 'store-factory.ts'));
      expect(source).toMatch(/if \(__DEV__\) \{[\s\S]*require\('\.\/fake-store'\)/);
    }
  });

  it('screens cannot bypass the premium services', () => {
    for (const file of sourceFiles(join(SRC, 'features'))) {
      const source = readFileSync(file, 'utf8');
      const where = relative(SRC, file);
      for (const spec of importsOf(source)) {
        expect(spec, where).not.toMatch(
          /domain\/render\/render-html|services\/export\/expo-export-platform|services\/storage\/resume-library|services\/entitlement\/(fake-store|store-factory|entitlement-service)|domain\/entitlement\/policy/,
        );
      }
      expect(source, where).not.toMatch(/\b(matchJob|analyzeJobMatch)\(/);
    }
  });

  it('nothing persists a premium boolean', () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(/(is_premium|isPremium)\s*[:=]\s*true/);
    }
  });
});

describe('secure export boundary (step 4)', () => {
  // Value imports only: `import type` cannot execute anything.
  const valueImportsOf = (source: string) =>
    [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((match) => match[1]);
  const owners = (pattern: RegExp) =>
    sourceFiles()
      .filter((file) => valueImportsOf(readFileSync(file, 'utf8')).some((spec) => pattern.test(spec)))
      .map((file) => relative(SRC, file))
      .sort();

  it('only the file export platform uses the DOCX generator', () => {
    expect(owners(/domain\/render\/export-docx$/)).toEqual([join('services', 'export', 'file-export-platform.ts')]);
  });

  it('only the file export platform renders in PDF mode (screens and other services cannot)', () => {
    const pdfModeUsers = sourceFiles()
      .filter((file) => /mode:\s*'pdf'/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(pdfModeUsers).toEqual([join('services', 'export', 'file-export-platform.ts')]);
    expect(owners(/domain\/render\/render-html$/)).toEqual(
      [join('services', 'export', 'file-export-platform.ts'), join('services', 'preview', 'preview-service.ts')].sort(),
    );
  });

  it('only the Expo export adapter touches printing, sharing files and the file system', () => {
    const expo = join('services', 'export', 'expo-export-platform.ts');
    expect(owners(/^expo-print$/)).toEqual([expo]);
    expect(owners(/^expo-sharing$/)).toEqual([expo]);
    expect(owners(/^expo-file-system/)).toEqual([expo]);
  });

  it('screens reach exports only through ExportService', () => {
    for (const file of sourceFiles(join(SRC, 'features'))) {
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        expect(spec, relative(SRC, file)).not.toMatch(
          /services\/export\/(file-export-platform|expo-export-platform|rasterizer\/)|domain\/render\/(export-docx|render-html)|pdfjs/,
        );
      }
    }
  });

  it('ExportService never reads export history', () => {
    const source = readFileSync(join(SRC, 'services', 'export', 'export-service.ts'), 'utf8');
    expect(source).not.toMatch(/\.list(Recent|ForResume)\(/);
  });
});

describe('image export boundary (step 6)', () => {
  const RASTER = join('services', 'export', 'rasterizer');
  const references = (pattern: RegExp) =>
    [...sourceFiles(), ...sourceFiles(join(SRC, 'app'))]
      .filter((file, index, all) => all.indexOf(file) === index)
      .filter((file) => !file.endsWith('.generated.ts') && pattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort();

  it('only the rasterizer page loads the bundled pdf.js source', () => {
    expect(references(/pdfjs-source\.generated/)).toEqual([join(RASTER, 'rasterizer-page.ts')]);
    expect(references(/from ['"]pdfjs-dist|require\(['"]pdfjs-dist/)).toEqual([]);
  });

  it('only the export platform, its Expo adapter and the hidden host reach the rasterizer', () => {
    expect(references(/rasterizer\/rasterizer-bridge['"]|\.\/rasterizer-bridge['"]/)).toEqual(
      [join('services', 'export', 'expo-export-platform.ts'), join('services', 'export', 'file-export-platform.ts'), join(RASTER, 'RasterizerHost.tsx')].sort(),
    );
    expect(references(/rasterizer-page['"]/)).toEqual([join(RASTER, 'RasterizerHost.tsx'), join(RASTER, 'rasterizer-bridge.ts')].sort());
    // The host is mounted once, by the root layout; no screen renders or drives it.
    expect(references(/RasterizerHost['"]/)).toEqual([join('app', '_layout.tsx')]);
    expect(references(/__rasterize/)).toEqual([join(RASTER, 'rasterizer-bridge.ts'), join(RASTER, 'rasterizer-page.ts')].sort());
  });

  it('image generation is only reachable through ExportService (format png → export.image)', () => {
    const service = readFileSync(join(SRC, 'services', 'export', 'export-service.ts'), 'utf8');
    expect(service).toMatch(/png: 'export\.image'/);
    expect(references(/\.generatePng\(/)).toEqual([join('services', 'export', 'export-service.ts')]);
    expect(references(/\.rasterize\(/)).toEqual([join('services', 'export', 'file-export-platform.ts')]);
  });

  it('pdfjs-dist is pinned exactly, and the generated source is not committed', () => {
    expect(pkg.dependencies['pdfjs-dist']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(readFileSync(join(ROOT, '.gitignore'), 'utf8')).toMatch(/^\*\.generated\.ts$/m);
    expect((pkg as unknown as { scripts: Record<string, string> }).scripts.postinstall).toBe('node scripts/pdfjs-source.mjs');
  });
});

describe('editor and Resume Check stay FREE (step 7)', () => {
  it('neither the editor nor the check imports entitlement, premium, paywall or export code', () => {
    for (const dir of [join(SRC, 'features', 'editor'), join(SRC, 'features', 'check')]) {
      for (const file of sourceFiles(dir)) {
        for (const spec of importsOf(readFileSync(file, 'utf8'))) {
          expect(spec, relative(SRC, file)).not.toMatch(/entitlement|premium|paywall|services\/export|unlock/);
        }
      }
    }
  });

  it('Resume Check logic stays pure domain code', () => {
    const score = readFileSync(join(SRC, 'domain', 'check', 'resume-score.ts'), 'utf8');
    expect(importsOf(score).every((spec) => spec.startsWith('../'))).toBe(true);
  });
});

describe('template gallery (template-first navigation)', () => {
  it('the unwatermarked template preview renders only the sample resume, in preview mode', () => {
    const source = readFileSync(join(SRC, 'domain', 'templates', 'sample-preview.ts'), 'utf8');
    expect(source).toMatch(/renderResumeHtml\(SAMPLE_RESUME, \{/);
    expect(source).toMatch(/mode: 'preview'/);
    expect(source.match(/renderResumeHtml\(/g)).toHaveLength(1);
    expect(source).toMatch(/^export function templateSampleHtml\(templateId: string\): string/m);
  });

  it('gallery screens use the existing registry and renderer: no export, entitlement or second renderer', () => {
    const files = sourceFiles(join(SRC, 'features', 'templates'));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const spec of importsOf(source)) {
        expect(spec, relative(SRC, file)).not.toMatch(/entitlement|premium|paywall|services\/export|services\/preview|unlock|domain\/render/);
      }
      expect(source, relative(SRC, file)).not.toMatch(/<!DOCTYPE|TEMPLATES\s*[:=]\s*\[|TemplateConfig\s*=\s*\{/);
    }
  });
});

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAtsReadability } from '../domain/ats/ats';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type StoredResume } from '../domain/resume/types';
import { accentsFor, PRESET_ACCENTS } from '../domain/templates/accents';
import { TEMPLATES } from '../domain/templates/templates';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import {
  ExportHandleInvalidError,
  ExportService,
  type ExportArtifact,
  type ExportPlatform,
} from '../services/export/export-service';
import { pdfHtml } from '../services/export/file-export-platform';
import { renderPreview } from '../services/preview/preview-service';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase } from '../services/storage/sqlite/database';
import { applyCoachFix, jobMatch, writingCoach } from '../services/tools/resume-tools';
import { openTestDatabase, tempDir, testId } from './helpers/node-sqlite';

// Phase 13C: My Resume is completely free. Every capability runs for everyone, and no
// monetization architecture (entitlement, purchase, paywall, prices) remains in the app.

const SRC = join(__dirname, '..');
const ROOT = join(SRC, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

/** Production source: everything under src/ except tests and generated vendor code. */
const productionFiles = (dir = SRC): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.generated.ts') ? [path] : [];
  });

const resume = (overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1', title: 'Mine', templateId: 'corporate-boardroom', accent: '#1B2B47', language: 'en', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1, ...overrides,
});

/** An in-memory export platform that records what happened. */
function platform() {
  const live = new Set<string>();
  const log: string[] = [];
  let next = 0;
  const make = (kind: string) => async (): Promise<ExportArtifact> => {
    const id = `${kind}-${++next}`;
    live.add(id);
    log.push(`generate:${kind}`);
    return { id };
  };
  const p: ExportPlatform & { live: Set<string>; log: string[]; failShare: Error | null } = {
    live,
    log,
    failShare: null,
    generatePdf: make('pdf'),
    generateDocx: make('docx'),
    generatePng: make('png'),
    async share(artifact) {
      if (p.failShare) throw p.failShare;
      log.push(`share:${artifact.id}`);
      return 'unknown';
    },
    async discard(artifact) {
      live.delete(artifact.id);
      log.push(`discard:${artifact.id}`);
    },
  };
  return p;
}

// --- A–C. exports ---

describe('exports need no entitlement', () => {
  it('A. PDF', async () => {
    const p = platform();
    await new ExportService(p).exportPdf(resume());
    expect(p.log).toEqual(['generate:pdf', 'share:pdf-1']);
  });

  it('B. DOCX', async () => {
    const p = platform();
    await new ExportService(p).exportDocx(resume());
    expect(p.log).toEqual(['generate:docx', 'share:docx-1']);
  });

  it('C. image (PNG)', async () => {
    const p = platform();
    await new ExportService(p).exportImage(resume(), 'a4');
    expect(p.log).toEqual(['generate:png', 'share:png-1']);
  });

  it('the export service is constructed from the platform alone', () => {
    expect(ExportService.length).toBe(1);
    expect(read('services/export/use-export-service.ts')).toMatch(/new ExportService\(getExpoExportPlatform\(\), \{/);
  });
});

// --- D–G. tools and customization ---

describe('tools and customization need no entitlement', () => {
  it('D. Writing Coach analyses and applies for everyone (English rules unchanged)', async () => {
    const report = await writingCoach('Led a analysis', 'experienceBullet', 'en');
    expect(await applyCoachFix('Led a analysis', 'experienceBullet', 'en', [], report.findings[0])).toBe('Led an analysis');
    expect((await writingCoach('Helped with the launch', 'experienceBullet', 'de')).support.kind).toBe('unavailable');
  });

  it('E. Job Match compares for everyone', async () => {
    const report = await jobMatch(SAMPLE_RESUME, 'We need Python and SQL.', 'en');
    expect(report.terms.map((t) => t.label)).toEqual(['Python', 'SQL']);
  });

  it('F. ATS readability runs for everyone, straight from the domain engine', () => {
    expect(checkAtsReadability(SAMPLE_RESUME, 'tech-builder', 'en').checks.length).toBeGreaterThan(5);
    expect(read('features/ats/AtsTool.tsx')).toMatch(/checkAtsReadability\(/);
  });

  it('G. customization: every preset and any custom hex color can be applied; the presets are unchanged', async () => {
    expect([...PRESET_ACCENTS]).toEqual(['#171717', '#1A365D', '#0F766E', '#065F46', '#B45309', '#9F1239', '#4338CA', '#E63946']);
    expect(accentsFor('tech-builder')[0]).toBe(TEMPLATES.find((t) => t.id === 'tech-builder')!.defaultAccent);
    // The store's setAccent validates the color and saves it: no gate in between.
    const store = read('services/storage/resume-store.tsx');
    expect(store).toMatch(/setAccent: \(id, accent\) => \{\s*if \(!library\.get\(id\) \|\| !isHexColor\(accent\)\) return;\s*library\.update\(id, \{ accent \}\);/);
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    const library = new ResumeLibrary(app.resumes, { newId: testId });
    const created = library.create(emptyResume(), 'Mine', 'tech-builder', 'en');
    for (const color of [...accentsFor('tech-builder'), '#123ABC']) {
      library.update(created.id, { accent: color });
      expect(library.get(created.id)!.accent).toBe(color);
    }
    await library.flush();
    expect((await app.resumes.get(created.id))!.accent).toBe('#123ABC');
    await db.close();
    dir.cleanup();
  });
});

// --- H. templates ---

describe('H. all 12 templates need no entitlement', () => {
  it('each can be chosen, previewed (clean) and exported', async () => {
    expect(TEMPLATES).toHaveLength(12);
    const dir = tempDir();
    const db = openTestDatabase(dir.file('app.db'));
    const app = await initializeDatabase(db, { newId: testId });
    const library = new ResumeLibrary(app.resumes, { newId: testId });
    for (const template of TEMPLATES) {
      const created = library.create(SAMPLE_RESUME, template.id, template.id, 'en');
      expect(created.templateId).toBe(template.id);
      expect(renderPreview(created)).not.toContain('class="watermark"');
      expect(pdfHtml(created, 'letter')).toContain('<!--content-->');
      const p = platform();
      await new ExportService(p).exportPdf(created);
      expect(p.log, template.id).toEqual(['generate:pdf', 'share:pdf-1']);
    }
    await db.close();
    dir.cleanup();
  });

  it('no gallery, preview or editor screen shows a lock', () => {
    for (const file of ['features/templates/TemplateCard.tsx', 'features/templates/TemplateGalleryScreen.tsx', 'features/templates/TemplatePreviewScreen.tsx', 'features/preview/PreviewScreen.tsx', 'features/editor/EditorScreen.tsx', 'features/library/HomeScreen.tsx']) {
      expect(read(file), file).not.toMatch(/LockIcon|🔒|locked|premium/i);
    }
  });
});

// --- I–L. nothing of the monetization architecture remains ---

describe('no paywall, purchase provider, entitlement database or billing package', () => {
  it('I. the paywall is gone: no route, no screen, no navigation to it', () => {
    expect(existsSync(join(SRC, 'app', 'unlock.tsx'))).toBe(false);
    expect(existsSync(join(SRC, 'features', 'paywall'))).toBe(false);
    expect(read('app/_layout.tsx')).not.toMatch(/unlock|paywall|Entitlement/i);
    for (const file of productionFiles()) expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(/['"`]\/unlock|name="unlock"/);
    expect(en).not.toHaveProperty('paywall');
  });

  it('J. no purchase or store provider exists or is instantiated', () => {
    expect(existsSync(join(SRC, 'services', 'entitlement'))).toBe(false);
    expect(existsSync(join(SRC, 'services', 'premium'))).toBe(false);
    expect(existsSync(join(SRC, 'domain', 'entitlement'))).toBe(false);
    for (const file of productionFiles()) {
      expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(/new \w*(Store|Purchase|Billing|Subscription)Provider\(|createStoreProvider/);
    }
  });

  it('K. no entitlement database is opened: the app opens only the resume database and the legacy import store', () => {
    const opened = productionFiles().flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/['"]([\w-]+\.db)['"]/g)].map((m) => m[1]));
    expect(opened.sort()).toEqual(['my-resume-kv.db', 'my-resume.db']);
    for (const file of productionFiles()) expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(/my-resume-entitlement|entitlement\.cache/);
  });

  it('L. no billing package is declared, locked or imported', () => {
    const BILLING = /react-native-purchases|@revenuecat|react-native-iap|expo-iap|expo-in-app-purchases|react-native-billing|google-play-billing|dodopayments|dodo-payments|@stripe|"stripe"|storekit/i;
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    expect(pkg).not.toMatch(BILLING);
    const lock = join(ROOT, 'package-lock.json');
    if (existsSync(lock)) expect(readFileSync(lock, 'utf8')).not.toMatch(BILLING);
    for (const file of productionFiles()) expect(readFileSync(file, 'utf8'), relative(SRC, file)).not.toMatch(BILLING);
    for (const config of ['app.json', 'eas.json']) {
      expect(readFileSync(join(ROOT, config), 'utf8'), config).not.toMatch(/BILLING|billing|purchase|storekit|revenuecat|subscription/i);
    }
  });
});

// --- M–N. export security is unchanged ---

describe('export security still holds', () => {
  it('M. handles are single-use, expire, and cannot be forged', async () => {
    const p = platform();
    const clock = { now: 1_000 };
    const service = new ExportService(p, { now: () => clock.now, handleLifetimeMs: 60_000 });
    const once = await service.prepare(resume(), { format: 'pdf' });
    await service.share(once);
    await expect(service.share(once)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    const stale = await service.prepare(resume(), { format: 'docx' });
    clock.now += 60_001;
    await expect(service.share(stale)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    const genuine = await service.prepare(resume(), { format: 'png' });
    await expect(service.share({ ...genuine })).rejects.toBeInstanceOf(ExportHandleInvalidError);
    await expect(new ExportService(p).share(genuine)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    expect(p.log.filter((l) => l.startsWith('share:'))).toEqual(['share:pdf-1']);
  });

  it('N. a failed share deletes the artifact and invalidates the handle; an interrupted export too', async () => {
    const p = platform();
    const foreground = { value: true };
    const service = new ExportService(p, { isForeground: () => foreground.value });
    p.failShare = new Error('share sheet crashed');
    const failed = await service.prepare(resume(), { format: 'pdf' });
    await expect(service.share(failed)).rejects.toThrow('share sheet crashed');
    await expect(service.share(failed)).rejects.toBeInstanceOf(ExportHandleInvalidError);
    p.failShare = null;
    const interrupted = await service.prepare(resume(), { format: 'docx' });
    foreground.value = false;
    await expect(service.share(interrupted)).rejects.toThrow(/foreground/);
    expect(p.live.size).toBe(0);
  });
});

// --- O–P. localization ---

type Leaf = [string, unknown];
const leaves = (node: unknown, prefix = ''): Leaf[] =>
  typeof node === 'object' && node !== null && !('other' in node)
    ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`))
    : [[prefix.slice(0, -1), node]];
const catalogHash = (catalog: unknown) => createHash('sha256').update(JSON.stringify(leaves(catalog))).digest('hex');

describe('localization is unchanged apart from the removed monetization keys', () => {
  // The hashes equal those of the bc39779 catalogs with exactly these 29 keys removed:
  // nav.premium, coach.locked, match.compareLocked, preview.locked, preview.devStore and paywall.* (24).
  it('O. English: 445 keys, every remaining value unchanged', () => {
    expect(leaves(en)).toHaveLength(445);
    expect(catalogHash(en)).toBe('bbd8860f9c6f7fc294f00b930f2808855ed2aa9fb7eb87626f10c317cc2fbd10');
  });

  it('P. German: 445 keys, every remaining value unchanged', () => {
    expect(leaves(de)).toHaveLength(445);
    expect(catalogHash(de)).toBe('99a5cf244a82e7f666d671611812683c99c6873fd8640f248de9ba8fdf19dd7a');
  });

  it('no catalog text mentions prices, subscriptions, purchases or locks', () => {
    for (const [name, catalog] of [['en', en], ['de', de]] as const) {
      const text = leaves(catalog).map(([, v]) => JSON.stringify(v)).join('\n');
      expect(text, name).not.toMatch(/premium|subscri|purchase|restore purchases|unlock|upgrade|lifetime|\$\d|€\s?\d|🔒|Abo\b|Abonn|Kauf/i);
    }
  });
});

// --- monetization guard ---

describe('monetization guard: production source has no monetization architecture', () => {
  // Identifiers and phrases of the removed architecture. Matching is on production source
  // only (tests, docs and generated vendor code are not scanned).
  const FORBIDDEN: [string, RegExp][] = [
    ['entitlement service', /\bEntitlement(Service|Provider|Reader|Decision|Cache)\b|\buseEntitlement\b/],
    ['premium gate / tools', /\bPremium(Gate|Tools|Feature|RequiredError)\b|\bPREMIUM_(FEATURES|PRICE|STATES|ENTITLEMENT_ID)\b/],
    ['premium flags', /\b(isPremium|premiumOnly|requiresPremium|is_premium)\b|decision\.premium/],
    ['store providers', /\bFakeStore(Provider)?\b|\bStoreProvider\b|\bUnavailableStoreProvider\b|\bStoreOffer\b|fake-store/],
    ['billing vendors', /RevenueCat|StoreKit|Play ?Billing|Dodo ?Payments/i],
    ['purchase / subscription providers', /\b(Purchase|Subscription|Billing)(Provider|Service|Outcome|Result)\b/],
    ['paywall', /\bPaywall(Coordinator)?\b|\bpaywall\b|UnlockScreen|['"`]\/unlock/],
    ['prices', /\$\d+\.\d{2}|priceString|priceLabel/],
  ];

  it('no production file matches', () => {
    const hits: string[] = [];
    for (const file of productionFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const [what, pattern] of FORBIDDEN) if (pattern.test(source)) hits.push(`${relative(SRC, file)}: ${what}`);
    }
    expect(hits).toEqual([]);
  });

  it('the guard catches each kind of reintroduced monetization code', () => {
    const samples = [
      'const service = new EntitlementService(store, cache);',
      'await gate.require(feature); // PremiumGate',
      'if (user.isPremium) unlock();',
      'export const premiumOnly = true;',
      "import Purchases from 'react-native-purchases'; // RevenueCat",
      'class FakeStoreProvider {}',
      'paywall.request({ feature, run });',
      "router.push('/unlock');",
      "const PRICE = '$7.99';",
      'new SubscriptionProvider()',
    ];
    for (const sample of samples) expect(FORBIDDEN.some(([, pattern]) => pattern.test(sample)), sample).toBe(true);
    for (const fine of ["const accent = '#1A365D';", 'renderPreview(resume)', 'await exporter.exportPdf(resume);', "t('coach.open')"]) {
      expect(FORBIDDEN.some(([, pattern]) => pattern.test(fine)), fine).toBe(false);
    }
  });
});

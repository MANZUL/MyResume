import { describe, expect, it } from 'vitest';
import { PREMIUM_FEATURES, PremiumRequiredError } from '../domain/entitlement/features';
import { FREE_PRESET_ACCENTS, freeAccentsFor } from '../domain/entitlement/palette';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import type { StoredResume } from '../domain/resume/types';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PaywallCoordinator } from '../services/entitlement/paywall';
import { PremiumGate } from '../services/entitlement/premium-gate';
import { ExportService, type ExportArtifact, type ExportPlatform } from '../services/export/export-service';
import { CustomizationService } from '../services/premium/customization';
import { FeatureNotAvailableYetError, PremiumTools } from '../services/premium/premium-tools';
import { PreviewService } from '../services/preview/preview-service';

const T = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const JD = 'Senior product manager. Requirements: product strategy, user research, SQL, stakeholder management and analytics.';

const resume = (overrides: Partial<StoredResume> = {}): StoredResume => ({
  id: 'r1', title: 'Mine', templateId: 'tech-builder', accent: '#3B5168', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1, ...overrides,
});

function world(premium: boolean) {
  const store = new FakeStoreProvider({ storeNow: () => T });
  if (premium) store.setSubscription('active', T + 30 * DAY);
  const entitlements = new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T);
  const gate = new PremiumGate(entitlements);
  const log: string[] = [];
  const artifacts: ExportArtifact[] = [];
  const platform: ExportPlatform = {
    generatePdf: async () => {
      log.push('generate pdf');
      const a = { id: `pdf-${artifacts.length}` };
      artifacts.push(a);
      return a;
    },
    generateDocx: async () => {
      log.push('generate docx');
      const a = { id: `docx-${artifacts.length}` };
      artifacts.push(a);
      return a;
    },
    generatePng: async () => {
      log.push('generate png');
      const a = { id: `png-${artifacts.length}` };
      artifacts.push(a);
      return a;
    },
    share: async (a) => void log.push(`share ${a.id}`),
    discard: async (a) => void log.push(`discard ${a.id}`),
  };
  const exporter = new ExportService(gate, platform, undefined);
  const accents: string[] = [];
  const customization = new CustomizationService(gate, { update: (_id, patch) => void accents.push(patch.accent) });
  return {
    store, entitlements, gate, log, platform, exporter, accents, customization,
    tools: new PremiumTools(gate),
    preview: new PreviewService(entitlements),
    paywall: new PaywallCoordinator(entitlements),
  };
}

describe('feature gates (service layer)', () => {
  it('every premium feature is refused for FREE users and allowed for PREMIUM users', async () => {
    const free = world(false);
    const paid = world(true);
    for (const feature of PREMIUM_FEATURES) {
      await expect(free.gate.require(feature), feature).rejects.toEqual(new PremiumRequiredError(feature));
      await expect(paid.gate.require(feature), feature).resolves.toMatchObject({ premium: true });
    }
  });

  it('Job Match: FREE refused before running, PREMIUM gets results', async () => {
    await expect(world(false).tools.jobMatch(SAMPLE_RESUME, JD)).rejects.toBeInstanceOf(PremiumRequiredError);
    const result = await world(true).tools.jobMatch(SAMPLE_RESUME, JD);
    expect(result.counts.inJob).toBeGreaterThan(0);
  });

  it('Writing Coach: FREE refused before analysis; PREMIUM gets a report (step 8)', async () => {
    await expect(world(false).tools.writingCoach('Helped with the launch', 'experienceBullet')).rejects.toEqual(new PremiumRequiredError('coach'));
    const report = await world(true).tools.writingCoach('Helped with the launch', 'experienceBullet');
    expect(report.findings.map((f) => f.rule)).toContain('weak-opener');
  });

  it('Tailoring: FREE refused; PREMIUM passes the gate (feature itself comes in step 10)', async () => {
    await expect(world(false).tools.tailoring(SAMPLE_RESUME, JD)).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(world(true).tools.tailoring(SAMPLE_RESUME, JD)).rejects.toBeInstanceOf(FeatureNotAvailableYetError);
  });

  it('Custom accent: default + 8 presets are FREE; any other color needs PREMIUM', async () => {
    expect(freeAccentsFor('tech-builder')).toEqual(['#3B5168', ...FREE_PRESET_ACCENTS]);
    const free = world(false);
    for (const color of freeAccentsFor('tech-builder')) await free.customization.setAccent('r1', 'tech-builder', color);
    await free.customization.setAccent('r1', 'tech-builder', '#e63946'); // case-insensitive preset
    expect(free.accents).toHaveLength(10);
    await expect(free.customization.setAccent('r1', 'tech-builder', '#123456')).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(free.accents).not.toContain('#123456');

    const paid = world(true);
    await paid.customization.setAccent('r1', 'tech-builder', '#123456');
    expect(paid.accents).toEqual(['#123456']);
    await expect(paid.customization.setAccent('r1', 'tech-builder', 'red')).rejects.toThrow(/valid color/);
  });

  it('Clean preview: FREE always watermarked, PREMIUM clean', async () => {
    const free = await world(false).preview.render(resume());
    expect(free.watermarked).toBe(true);
    expect(free.html).toContain('class="watermark"');
    const paid = await world(true).preview.render(resume());
    expect(paid.watermarked).toBe(false);
    expect(paid.html).not.toContain('class="watermark"');
  });

  it('FREE users keep the free parts: previewing works and uses all templates', async () => {
    const free = world(false);
    for (const templateId of ['corporate-boardroom', 'creative-editorial', 'trades-foreman']) {
      const out = await free.preview.render(resume({ templateId }));
      expect(out.html).toContain('Eleanor Vance');
    }
  });
});

describe('export gate (ExportService is the boundary)', () => {
  it('PDF, DOCX and image exports are refused for FREE users before anything is generated', async () => {
    const free = world(false);
    await expect(free.exporter.exportPdf(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(free.exporter.exportDocx(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    await expect(free.exporter.exportImage(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(free.log).toEqual([]);
  });

  it('PREMIUM PDF, DOCX and image: generate → second check → share; shared files are kept for the launch purge', async () => {
    const paid = world(true);
    const verifyBefore = paid.store.calls.verify;
    await paid.exporter.exportPdf(resume());
    await paid.exporter.exportDocx(resume());
    await paid.exporter.exportImage(resume());
    expect(paid.log).toEqual(['generate pdf', 'share pdf-0', 'generate docx', 'share docx-1', 'generate png', 'share png-2']);
    expect(paid.store.calls.verify - verifyBefore).toBe(6); // two entitlement checks per export
  });

  it('premium lost between generation and sharing → not shared, artifact discarded', async () => {
    const paid = world(true);
    const generate = paid.platform.generatePdf;
    paid.platform.generatePdf = async (r) => {
      const artifact = await generate(r);
      paid.store.refund(); // refund lands while the PDF is being generated
      return artifact;
    };
    await expect(paid.exporter.exportPdf(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(paid.log).toEqual(['generate pdf', 'discard pdf-0']);
  });

  it('a failed share discards the artifact', async () => {
    const paid = world(true);
    paid.platform.share = async () => {
      throw new Error('share sheet unavailable');
    };
    await expect(paid.exporter.exportPdf(resume())).rejects.toThrow('share sheet unavailable');
    expect(paid.log).toEqual(['generate pdf', 'discard pdf-0']);
  });

  it('export works offline for PREMIUM within the cache window and is refused after it', async () => {
    const clock = { now: T };
    const store = new FakeStoreProvider({ storeNow: () => clock.now });
    store.setSubscription('active', T + 30 * DAY);
    const entitlements = new EntitlementService(store, new MemoryEntitlementCacheStore(), () => clock.now);
    await entitlements.check();
    store.online = false;
    const log: string[] = [];
    const exporter = new ExportService(new PremiumGate(entitlements), {
      generatePdf: async () => ((log.push('generate'), { id: 'a' })),
      generateDocx: async () => ({ id: 'b' }),
      generatePng: async () => ({ id: 'c' }),
      share: async () => void log.push('share'),
      discard: async () => void log.push('discard'),
    });
    clock.now += 3 * DAY;
    await exporter.exportPdf(resume());
    clock.now += 5 * DAY;
    await expect(exporter.exportPdf(resume())).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(log).toEqual(['generate', 'share']);
  });
});

describe('callers cannot supply entitlement decisions', () => {
  const claim = { premium: true, isPremium: true, unlocked: true, reason: 'verified', watermark: false } as never;

  it('premium operations take no decision argument', () => {
    expect(ExportService.prototype.exportPdf.length).toBe(1);
    expect(ExportService.prototype.exportDocx.length).toBe(1);
    expect(PreviewService.prototype.render.length).toBe(1);
    expect(PremiumGate.prototype.require.length).toBe(1);
  });

  it('extra "I am premium" arguments are ignored everywhere', async () => {
    const free = world(false);
    const anyExporter = free.exporter as unknown as { exportPdf: (...args: unknown[]) => Promise<void> };
    await expect(anyExporter.exportPdf(resume(), claim)).rejects.toBeInstanceOf(PremiumRequiredError);
    const anyTools = free.tools as unknown as { jobMatch: (...args: unknown[]) => Promise<unknown> };
    await expect(anyTools.jobMatch(SAMPLE_RESUME, JD, claim)).rejects.toBeInstanceOf(PremiumRequiredError);
    const anyGate = free.gate as unknown as { require: (...args: unknown[]) => Promise<unknown> };
    await expect(anyGate.require('export.pdf', claim)).rejects.toBeInstanceOf(PremiumRequiredError);
    const anyPreview = free.preview as unknown as { render: (...args: unknown[]) => Promise<{ watermarked: boolean }> };
    expect((await anyPreview.render(resume(), claim)).watermarked).toBe(true);
    expect(free.log).toEqual([]);
  });

  it('a resume object carrying premium-looking fields changes nothing', async () => {
    const free = world(false);
    const sneaky = { ...resume(), premium: true, entitlement: 'premium' } as StoredResume;
    await expect(free.exporter.exportPdf(sneaky)).rejects.toBeInstanceOf(PremiumRequiredError);
  });
});

describe('paywall flow and resume after purchase', () => {
  it('Export PDF → refused → paywall → fake subscription → export resumes through the normal checks', async () => {
    const w = world(false);
    const opened: string[] = [];
    w.paywall.onRequest((feature) => opened.push(feature));

    const exportPdf = async (): Promise<void> => {
      try {
        await w.exporter.exportPdf(resume());
      } catch (error) {
        if (error instanceof PremiumRequiredError) w.paywall.request({ feature: error.feature, run: exportPdf });
        else throw error;
      }
    };

    await exportPdf();
    expect(opened).toEqual(['export.pdf']);
    expect(w.log).toEqual([]);

    const verifyBefore = w.store.calls.verify;
    const { outcome, resume: resumeAction } = await w.paywall.subscribe();
    expect(outcome).toBe('subscribed');
    expect(resumeAction).not.toBeNull();
    await resumeAction!();
    expect(w.log).toEqual(['generate pdf', 'share pdf-0']);
    // purchase re-verification (1) + two export checks (2)
    expect(w.store.calls.verify - verifyBefore).toBe(3);
    expect(w.paywall.pendingFeature()).toBeNull();
  });

  it('cancelled purchase: nothing resumes, the action stays pending until dismissed', async () => {
    const w = world(false);
    let ran = false;
    w.paywall.request({ feature: 'jobMatch', run: async () => void (ran = true) });
    w.store.setNextPurchaseResult({ kind: 'cancelled' });
    expect(await w.paywall.subscribe()).toEqual({ outcome: 'cancelled', resume: null });
    expect(ran).toBe(false);
    expect(w.paywall.pendingFeature()).toBe('jobMatch');
    w.paywall.dismiss();
    expect(w.paywall.pendingFeature()).toBeNull();
  });

  it('pending purchase does not resume; restore of an active subscription does', async () => {
    const w = world(false);
    let runs = 0;
    w.paywall.request({ feature: 'export.docx', run: async () => void (runs += 1) });
    w.store.setNextPurchaseResult({ kind: 'pending' });
    expect((await w.paywall.subscribe()).resume).toBeNull();
    w.store.approvePending();
    const restored = await w.paywall.restore();
    expect(restored.premium).toBe(true);
    await restored.resume!();
    expect(runs).toBe(1);
  });

  it('the resumed action is still checked: if premium is gone again, it is refused', async () => {
    const w = world(false);
    w.paywall.request({ feature: 'export.pdf', run: () => w.exporter.exportPdf(resume()) });
    const { resume: resumeAction } = await w.paywall.subscribe();
    w.store.refund();
    await expect(resumeAction!()).rejects.toBeInstanceOf(PremiumRequiredError);
    expect(w.log).toEqual([]);
  });
});

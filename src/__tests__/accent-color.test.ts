import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isHexColor, normalizeHexColor } from '../domain/shared/text';
import { accentsFor, CUSTOM_COLOR_EXAMPLE, customAccent, PRESET_ACCENTS } from '../domain/templates/accents';
import { TEMPLATES } from '../domain/templates/templates';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { ar } from '../i18n/messages/ar';
import { de } from '../i18n/messages/de';
import { en } from '../i18n/messages/en';
import { es } from '../i18n/messages/es';
import { fr } from '../i18n/messages/fr';
import { buildResumeDocxBase64 } from '../domain/render/export-docx';
import { pdfHtml } from '../services/export/file-export-platform';
import { renderPreview } from '../services/preview/preview-service';
import { ResumeLibrary } from '../services/storage/resume-library';
import { initializeDatabase, type AppDatabase } from '../services/storage/sqlite/database';
import { ManualTimers, openTestDatabase, tempDir, testId, type TestDatabase } from './helpers/node-sqlite';

// Phase 17: the custom accent color input. Any six-digit hex color can be used; nothing here
// claims every color is readable (the screen only shows the color, the user judges it).

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
// The UI palette lives in a React Native module, so it is read from the source text.
const palette = (name: string) => new RegExp(`\\n  ${name}: '(#[0-9A-Fa-f]{6})'`).exec(read('ui/components.tsx'))![1];
const colors = { text: palette('text'), card: palette('card') };

describe('normalizing and validating a typed color', () => {
  it('accepts six hex digits with or without "#", any case, surrounding spaces ignored, and returns #RRGGBB', () => {
    expect(normalizeHexColor('#a85432')).toBe('#A85432');
    expect(normalizeHexColor('A85432')).toBe('#A85432');
    expect(normalizeHexColor('  #1b2b47 ')).toBe('#1B2B47');
    expect(normalizeHexColor('abcdef')).toBe('#ABCDEF');
    expect(normalizeHexColor('#000000')).toBe('#000000');
    expect(normalizeHexColor('ffffff')).toBe('#FFFFFF');
    expect(isHexColor(normalizeHexColor('0f0f0f')!)).toBe(true);
  });

  it('refuses everything else, and never guesses', () => {
    for (const bad of ['', ' ', '#', '#abc', 'abc', '#12345', '1234567', '#1234567', '##A85432', 'A8 54 32', '#GGGGGG', 'red', 'rgb(1,2,3)', '#A85432;', '#A85432\n#000000', '０ａ５４３２', '#A85432 #', '0x A85432']) {
      expect(normalizeHexColor(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('applying a custom color', () => {
  it('a valid color is applied, normalized', () => {
    expect(customAccent('a85432', '#1B2B47')).toEqual({ valid: true, accent: '#A85432' });
    expect(customAccent('#0f766e', '#1B2B47')).toEqual({ valid: true, accent: '#0F766E' });
  });

  it('an invalid color is rejected and the current color is returned unchanged (nothing is mutated)', () => {
    for (const bad of ['', '#12', 'blue', '#GGGGGG', '12345']) expect(customAccent(bad, '#1B2B47')).toEqual({ valid: false, accent: '#1B2B47' });
  });

  it('the store only accepts valid colors too (a second guard)', () => {
    const store = read('services/storage/resume-store.tsx');
    expect(store).toMatch(/if \(!library\.get\(id\) \|\| !isHexColor\(accent\)\) return;/);
  });
});

describe('the custom color goes through the resume, its preview and its exports', () => {
  let dir: ReturnType<typeof tempDir>;
  let db: TestDatabase;
  let app: AppDatabase;
  const timers = new ManualTimers();

  beforeEach(async () => {
    dir = tempDir();
    db = openTestDatabase(dir.file('app.db'));
    app = await initializeDatabase(db, { newId: testId });
  });
  afterEach(async () => {
    await db.close();
    dir.cleanup();
  });

  it('persists with the resume (no schema change) and survives a restart', async () => {
    const library = new ResumeLibrary(app.resumes, { newId: testId, timers, now: timers.now });
    await library.load();
    const resume = library.create(SAMPLE_RESUME, 'CV', 'tech-builder');
    library.update(resume.id, { accent: customAccent('12ab9f', resume.accent).accent });
    await library.flush();
    library.dispose();
    const reopened = new ResumeLibrary(app.resumes, { newId: testId, timers, now: timers.now });
    await reopened.load();
    expect(reopened.get(resume.id)!.accent).toBe('#12AB9F');
    expect((await app.resumes.get(resume.id))!.accent).toBe('#12AB9F');
    reopened.dispose();
    const columns = (await db.all<{ name: string }>('PRAGMA table_info(resumes)')).map((c) => c.name);
    expect(columns).toEqual(['id', 'title', 'template_id', 'accent', 'data_json', 'is_active', 'created_at', 'updated_at', 'language']);
  });

  it('the preview, the PDF and the Word file use the color', async () => {
    const resume = { id: 'r', title: 't', templateId: 'tech-builder', accent: '#12AB9F', language: 'en' as const, data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1 };
    expect(renderPreview(resume)).toContain('--accent: #12AB9F');
    expect(pdfHtml(resume, 'a4')).toContain('--accent: #12AB9F');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(await buildResumeDocxBase64({ data: SAMPLE_RESUME, accent: '#12AB9F', templateName: 'x', language: 'en' }), 'base64'));
    expect(await zip.file('word/document.xml')!.async('string')).toContain('<w:color w:val="12AB9F"/>');
  });

  it('a bad stored color still renders with the template default (existing safety)', () => {
    const html = renderPreview({ id: 'r', title: 't', templateId: 'tech-builder', accent: 'red; } body { display:none', language: 'en', data: SAMPLE_RESUME, createdAt: 1, updatedAt: 1 });
    expect(html).not.toContain('display:none');
  });
});

describe('presets are unchanged', () => {
  it('the eight presets plus the template default, for every template', () => {
    expect(PRESET_ACCENTS).toEqual(['#171717', '#1A365D', '#0F766E', '#065F46', '#B45309', '#9F1239', '#4338CA', '#E63946']);
    for (const template of TEMPLATES) {
      const accents = accentsFor(template.id);
      expect(accents[0]).toBe(template.defaultAccent);
      for (const preset of PRESET_ACCENTS) expect(accents).toContain(preset);
      for (const accent of accents) expect(isHexColor(accent)).toBe(true);
      expect(new Set(accents).size).toBe(accents.length);
    }
  });
});

describe('the Preview screen', () => {
  const screen = read('features/preview/PreviewScreen.tsx');

  it('keeps the presets, and shows the current color when it is a custom one so the selection is always visible', () => {
    expect(screen).toMatch(/const presets = accentsFor\(resume\.templateId\);/);
    expect(screen).toMatch(/\[\.\.\.presets, resume\.accent\]/);
    expect(screen).toMatch(/swatches\.map\(/);
  });

  it('has a labeled hex input, an apply action, and a localized error that does not change the color', () => {
    expect(screen).toMatch(/accessibilityLabel=\{t\('preview\.customColor\.label'\)\}/);
    expect(screen).toMatch(/placeholder=\{t\('preview\.customColor\.placeholder'\)\}/);
    expect(screen).toMatch(/title=\{t\('preview\.customColor\.apply'\)\}/);
    expect(screen).toMatch(/t\('preview\.customColor\.invalid', \{ example: CUSTOM_COLOR_EXAMPLE \}\)/);
    expect(screen).toMatch(/const result = customAccent\(customColor, resume\.accent\);\n\s+if \(!result\.valid\) \{\n\s+setCustomColorInvalid\(true\);/);
    expect(screen).toMatch(/accessibilityRole="alert"/);
    expect(screen).toMatch(/onSubmitEditing=\{applyCustomColor\}/);
    expect(screen).toMatch(/autoCorrect=\{false\}/);
  });

  it('the input is left-to-right in an Arabic app, and the keyboard does not cover it on iOS', () => {
    expect(screen).toMatch(/contentTextStyle\('en'\)/);
    expect(screen).toMatch(/<KeyboardAvoidingView style=\{\{ flex: 1 \}\} behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}>/);
  });

  it('the selected swatch is a dark ring with a gap, and every swatch has a thin border (white and light colors stay visible)', () => {
    expect(screen).toMatch(/borderColor: selected \? colors\.text : 'transparent'/);
    expect(screen).toMatch(/backgroundColor: color, borderWidth: 1, borderColor: colors\.border/);
    // The ring against the white bar: far above the 3:1 non-text contrast guideline.
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    expect(ratio(colors.text, colors.card)).toBeGreaterThan(10);
  });

  it('never claims that a custom color is readable or accessible', () => {
    for (const catalog of [en, de, fr, es, ar]) {
      const text = Object.values(catalog.preview.customColor).join(' ');
      expect(text).not.toMatch(/contrast|accessib|readab|lisible|lesbar|Kontrast|accesib|legible|تباين|مقروء/i);
    }
  });
});

describe('custom color messages in all five languages', () => {
  const catalogs = { en, de, fr, es, ar };
  it('the same four keys everywhere; only "invalid" takes {example}', () => {
    for (const [language, catalog] of Object.entries(catalogs)) {
      const c = catalog.preview.customColor;
      expect(Object.keys(c).sort(), language).toEqual(['apply', 'invalid', 'label', 'placeholder']);
      expect(c.invalid, language).toContain('{example}');
      for (const key of ['apply', 'label', 'placeholder'] as const) expect(c[key], `${language} ${key}`).not.toMatch(/\{\w+\}/);
      expect(c.placeholder).toBe('#RRGGBB');
    }
    expect(CUSTOM_COLOR_EXAMPLE).toBe('#A85432');
    expect(isHexColor(CUSTOM_COLOR_EXAMPLE)).toBe(true);
  });

  it('are translated (the format placeholder is the same everywhere), and Arabic keeps the example isolated', () => {
    for (const language of ['de', 'fr', 'es', 'ar'] as const) {
      const c = catalogs[language].preview.customColor;
      for (const key of ['label', 'apply', 'invalid'] as const) expect(c[key], `${language} ${key}`).not.toBe(en.preview.customColor[key]);
    }
    expect(ar.preview.customColor.label).toMatch(/[؀-ۿ]/);
    expect(ar.preview.customColor.invalid).toMatch(/[؀-ۿ]/);
  });
});

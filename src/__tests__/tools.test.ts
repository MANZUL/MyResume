import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCoverLetter } from '../domain/letter/cover-letter';
import { buildResumeDocxBase64 } from '../domain/render/export-docx';
import { matchJob } from '../domain/match/job-match';
import { renderResumeHtml } from '../domain/render/render-html';
import { scoreResume } from '../domain/check/resume-score';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { TEMPLATES } from '../domain/templates/templates';
import { emptyResume } from '../domain/resume/types';

describe('matchJob', () => {
  it('reports matched and missing keywords deterministically', () => {
    const jd = 'We need a product strategy leader. Product strategy and user research are core. Kubernetes a plus. Kubernetes experience helps.';
    const result = matchJob(SAMPLE_RESUME, jd);
    expect(result.matched).toContain('product strategy');
    expect(result.missing).toContain('kubernetes');
    expect(result).toEqual(matchJob(SAMPLE_RESUME, jd));
  });
});

describe('renderResumeHtml', () => {
  it('renders every template', () => {
    for (const template of TEMPLATES) {
      const html = renderResumeHtml(SAMPLE_RESUME, { templateId: template.id, accent: template.defaultAccent, mode: 'pdf' });
      expect(html).toContain('Eleanor Vance');
    }
  });

  it('escapes user content so it cannot inject markup or script', () => {
    const data = { ...emptyResume(), name: '<img src=x onerror=alert(1)>' };
    const html = renderResumeHtml(data, { templateId: 'tech-builder', accent: '#000000', mode: 'preview' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('rejects a non-hex accent to prevent CSS injection', () => {
    const html = renderResumeHtml(SAMPLE_RESUME, { templateId: 'tech-builder', accent: 'red;}</style><script>', mode: 'pdf' });
    expect(html).not.toContain('</style><script>');
  });

  it('watermarks the preview only when asked, never the PDF by default', () => {
    expect(renderResumeHtml(SAMPLE_RESUME, { templateId: 'tech-builder', accent: '#000000', mode: 'preview', watermark: true })).toContain('class="watermark"');
    expect(renderResumeHtml(SAMPLE_RESUME, { templateId: 'tech-builder', accent: '#000000', mode: 'pdf' })).not.toContain('class="watermark"');
  });
});

describe('exports and tools', () => {
  it('builds a valid DOCX (zip) without a browser', async () => {
    const base64 = await buildResumeDocxBase64({ data: SAMPLE_RESUME, accent: '#1B2B47', templateName: 'The Boardroom' });
    expect(Buffer.from(base64, 'base64').subarray(0, 2).toString()).toBe('PK');
  });

  it('scores the sample resume', () => {
    expect(scoreResume(SAMPLE_RESUME).score).toBeGreaterThan(70);
  });

  it('builds a cover letter only from resume facts', () => {
    const letter = buildCoverLetter(SAMPLE_RESUME, { company: 'Globex', role: 'VP Product', hiringManager: '' });
    expect(letter).toContain('VP Product position at Globex');
    expect(letter).toContain('Director of Product at Acme Innovation Labs');
    expect(letter).toContain('Eleanor Vance');
  });
});

describe('no AI dependency', () => {
  it('app source never calls an AI provider or remote API', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== '__tests__') walk(path);
        } else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk(join(__dirname, '..'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/anthropic|openai|gemini|\bclaude\b|\bfetch\(|XMLHttpRequest|axios/i);
    }
  });

  it('has no AI SDK in dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).join(' ')).not.toMatch(/anthropic|openai|genai|langchain|ai-sdk/i);
  });
});

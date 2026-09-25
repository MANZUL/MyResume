import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PremiumRequiredError } from '../domain/entitlement/features';
import { analyzeJobMatch } from '../domain/job-match/job-match';
import { findHits } from '../domain/job-match/matcher';
import { detectTitle, segmentJobDescription } from '../domain/job-match/segment';
import { TAXONOMY, TAXONOMY_VERSION } from '../domain/job-match/taxonomy';
import { JOB_DESCRIPTION_MAX, JobDescriptionTooLongError, type JobMatchReport } from '../domain/job-match/types';
import { EDITOR_SECTIONS } from '../domain/resume/sections';
import { SAMPLE_RESUME } from '../domain/resume/sample-data';
import { emptyResume, type ResumeData } from '../domain/resume/types';
import { countsLine, MATCH_COPY, mentionedUnder, SECTION_LABELS } from '../features/job-match/match-copy';
import { MemoryEntitlementCacheStore } from '../services/entitlement/cache-store';
import { EntitlementService } from '../services/entitlement/entitlement-service';
import { FakeStoreProvider } from '../services/entitlement/fake-store';
import { PaywallCoordinator } from '../services/entitlement/paywall';
import { PremiumGate } from '../services/entitlement/premium-gate';
import { PremiumTools } from '../services/premium/premium-tools';
import { JDS, RESUMES } from './fixtures/job-corpus';

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

const found = (line: string, skillEntry = false) => findHits(line, { skillEntry }).map((h) => `${h.termId}:${line.slice(h.start, h.end)}`);
const ids = (line: string) => findHits(line).map((h) => h.termId);
const labels = (r: JobMatchReport) => r.terms.map((t) => t.label);
const inResume = (r: JobMatchReport) => r.terms.filter((t) => t.resume.length).map((t) => t.label);

// --- 1. matching rules ---

describe('matching: boundaries and substring traps', () => {
  it('Java is not found in JavaScript; SQL is not found in MySQL, PostgreSQL or NoSQL', () => {
    expect(ids('JavaScript and TypeScript')).toEqual(['javascript', 'typescript']);
    expect(ids('Java and JavaScript')).toEqual(['java', 'javascript']);
    expect(ids('MySQL, PostgreSQL and NoSQL stores')).toEqual(['mysql', 'postgresql']);
    expect(ids('Strong SQL')).toEqual(['sql']);
  });

  it('"C", "R" and "Go" only as whole tokens next to another language', () => {
    expect(ids('C++ and C# on the Cloud')).toEqual(['cpp', 'csharp']);
    expect(ids('C, C++ and Rust')).toEqual(['c', 'cpp', 'rust']); // "Rust" mid-sentence is the language
    expect(ids('Python, R and SQL')).toEqual(['python', 'r', 'sql']);
    expect(ids('R&D budget; React apps; RDS databases')).toEqual(['react']);
    expect(ids('Go-getters welcome')).toEqual([]);
    expect(ids('Go to market with us')).toEqual([]);
    expect(ids('Go/Rust or Python')).toEqual(['go', 'rust', 'python']);
    expect(ids('We use Golang')).toEqual(['go']);
  });

  it('ordinary words are not tools: "rest", "excel at", "swift", "rails"', () => {
    expect(ids('the rest of the team')).toEqual([]);
    expect(ids('REST APIs and RESTful API design')).toEqual(['rest', 'rest']);
    expect(ids('Excel at mentoring')).toEqual([]);
    expect(ids('Advanced Excel skills')).toEqual(['excel']);
    expect(ids('Swift delivery matters')).toEqual([]);
    expect(ids('Built apps in Swift')).toEqual(['swift']);
    expect(ids('safety rails and guardrails')).toEqual([]);
  });

  it('the longest match wins (no double counting of contained names)', () => {
    expect(ids('React Native apps')).toEqual(['react-native']);
    expect(ids('React and React Native')).toEqual(['react', 'react-native']);
    expect(ids('SQL Server administration')).toEqual(['sql-server']);
    expect(ids('ASP.NET and .NET Core')).toEqual(['dotnet', 'dotnet']);
    expect(ids('Node.js services')).toEqual(['nodejs']);
    expect(ids('Node services')).toEqual([]);
    expect(ids('GitHub Actions')).toEqual(['github-actions']);
  });

  it('case, punctuation, whitespace, hyphens and plurals', () => {
    expect(ids('PYTHON, python, Python.')).toEqual(['python', 'python', 'python']);
    expect(ids('pay-per-click and pay per click')).toEqual(['ppc', 'ppc']);
    expect(ids('micro-services and microservices')).toEqual(['microservices', 'microservices']);
    expect(ids('machine   learning')).toEqual(['machine-learning']);
    expect(ids('OKRs and firewalls')).toEqual(['okrs', 'firewalls']);
    expect(ids('(SQL)')).toEqual(['sql']);
    expect(ids('SQL.')).toEqual(['sql']);
  });

  it('aliases are exact alternative spellings of the same thing', () => {
    expect(found('Postgres, K8s, ReactJS, NodeJS, GA4, AdWords, split testing, Amazon Web Services, PowerBI, sklearn')).toEqual([
      'postgresql:Postgres', 'kubernetes:K8s', 'react:ReactJS', 'nodejs:NodeJS', 'google-analytics:GA4', 'google-ads:AdWords',
      'ab-testing:split testing', 'aws:Amazon Web Services', 'power-bi:PowerBI', 'scikit:sklearn',
    ]);
  });

  it('degrees: level only, conservative spellings', () => {
    expect(ids("Bachelor's degree in CS")).toEqual(['bachelors']);
    expect(ids('BSc Computer Science; B.S. in Math; B.A. English')).toEqual(['bachelors', 'bachelors', 'bachelors']);
    expect(ids("Master's degree preferred; Masters in Data")).toEqual(['masters', 'masters']);
    expect(ids('Master of Business Administration')).toEqual(['mba']);
    expect(ids('Scrum Master on the team')).toEqual(['scrum']); // "master" alone is not a degree
    expect(ids('BA/BS or equivalent')).toEqual([]); // bare "BA"/"BS" are too ambiguous ("BA" = business analyst)
    expect(ids('PhD or Ph.D. or doctorate')).toEqual(['phd', 'phd', 'phd']);
  });

  it('Skills entries: a short name counts only as the whole entry', () => {
    expect(found('R', true)).toEqual(['r:R']);
    expect(found('Go', true)).toEqual(['go:Go']);
    expect(found('Go-to-Market', true)).toEqual([]);
    expect(found('Excel', true)).toEqual(['excel:Excel']);
    expect(found('Excel', false)).toEqual([]); // alone at a sentence start
  });
});

// --- 2. sections and title ---

describe('job description sections and title', () => {
  it('recognises headings from a fixed list; unknown lines are "general"', () => {
    const lines = segmentJobDescription('Intro line\nRequirements:\n- SQL\nNice to have\n- dbt\nWhat you\'ll do\nBuild things\nBenefits\nDental');
    expect(lines.map((l) => `${l.section}:${l.text}`)).toEqual([
      'general:Intro line', 'required:- SQL', 'preferred:- dbt', 'responsibilities:Build things', 'about:Dental',
    ]);
  });

  it('inline labels only at the start of a line; mid-line markers keep the section', () => {
    const lines = segmentJobDescription('Requirements\n- Nice to have: MBA\n- SQL (PostgreSQL preferred)\nAbout us: we are Acme\nRequired: Python');
    expect(lines.map((l) => l.section)).toEqual(['preferred', 'required', 'about', 'required']);
  });

  it('a heading must be short and not a sentence', () => {
    expect(segmentJobDescription('Requirements for this role include SQL and Python and more words here.').map((l) => l.section)).toEqual(['general']);
  });

  it('title: labelled, or a short first line ending with a role noun; levels and qualifiers are removed for matching', () => {
    expect(detectTitle('Senior Software Engineer, Payments\n…')).toEqual({ text: 'Senior Software Engineer', core: 'Software Engineer' });
    expect(detectTitle('Position: SOC Analyst II\n…')).toEqual({ text: 'SOC Analyst II', core: 'SOC Analyst' });
    expect(detectTitle('Junior Developer (Entry-Level)')).toEqual({ text: 'Junior Developer', core: 'Developer' });
    expect(detectTitle('Product Manager - Growth')).toEqual({ text: 'Product Manager', core: 'Product Manager' });
    expect(detectTitle('Python developer needed.')).toBeNull(); // a sentence
    expect(detectTitle('About Acme\nWe are hiring')).toBeNull(); // no role noun
    expect(detectTitle('')).toBeNull();
  });
});

// --- 3. corpus ---

describe('corpus', () => {
  it('sections follow the headings ("What you\'ll do" is responsibilities, not requirements)', () => {
    const se = analyzeJobMatch(emptyResume(), JDS.softwareEngineer).terms;
    expect(se.find((t) => t.id === 'kubernetes')!.job.sections).toEqual(['responsibilities']);
    expect(se.find((t) => t.id === 'typescript')!.job.sections).toEqual(['required', 'responsibilities']);
    expect(se.find((t) => t.id === 'terraform')!.job.sections).toEqual(['preferred']);
  });

  it('each posting yields only listed terms, in section order', () => {
    const out = Object.fromEntries(Object.entries(JDS).map(([name, jd]) => [name, labels(analyzeJobMatch(emptyResume(), jd))]));
    expect(out).toEqual({
      softwareEngineer: ['TypeScript', 'JavaScript', 'SQL', 'PostgreSQL', 'React', "Bachelor's degree", 'REST APIs', 'Microservices', 'Node.js', 'Kubernetes', 'Docker', 'GitHub', 'CI/CD', 'Go', 'Rust', 'Kotlin', 'Terraform'],
      dataAnalyst: ['SQL', 'Python', 'pandas', 'Excel', 'Statistics', 'dbt', 'Airflow', 'Tableau', 'Power BI', 'A/B testing', 'BigQuery'],
      socAnalyst: ['CompTIA Security+', 'GIAC GCIH', 'TCP/IP', 'Firewalls', 'MITRE ATT&CK', 'NIST', 'ISO 27001', 'Splunk', 'Microsoft Sentinel', 'Incident response', 'Threat hunting', 'EDR', 'CrowdStrike', 'IDS/IPS'],
      productManager: ['A/B testing', 'SQL', 'Jira', 'Confluence', 'Figma', 'Agile', 'Scrum', 'Product roadmap', 'User research', 'Stakeholder management', 'MBA'],
      marketing: ['HubSpot', 'Salesforce', 'Marketing automation', 'Copywriting', 'SEO', 'SEM', 'Email marketing', 'Content marketing', 'Google Analytics', 'Google Ads'],
      entryLevel: ['HTML', 'CSS', 'JavaScript', 'Git', "Bachelor's degree"],
      short: ['Python'],
      long: ['SQL'],
      malformed: ['REST APIs', 'Java', 'JavaScript', 'C++'],
      traps: ['JavaScript', 'Java', 'MySQL', 'SQL', 'C++', 'C#', 'React Native', 'R', 'Python', 'Scala'],
    });
  });

  it('plan regression pairs: SQL, A/B testing, stakeholder management and user research are found; "nice" and "5+" never are', () => {
    const pm = labels(analyzeJobMatch(emptyResume(), JDS.productManager));
    for (const term of ['SQL', 'A/B testing', 'Stakeholder management', 'User research']) expect(pm).toContain(term);
    for (const jd of Object.values(JDS)) {
      for (const label of labels(analyzeJobMatch(emptyResume(), jd))) expect(label).not.toMatch(/nice|5\+|years|team|experience/i);
    }
  });

  it('company names, places, people and generic words are never terms; company-only mentions are dropped', () => {
    const all = Object.values(JDS).flatMap((jd) => labels(analyzeJobMatch(emptyResume(), jd)));
    for (const word of ['Acme', 'Austin', 'Berlin', 'Chicago', 'Denver', 'Insights', 'communication', 'teamwork', 'ownership']) {
      expect(all.map((l) => l.toLowerCase())).not.toContain(word.toLowerCase());
    }
    // "We run on AWS" appears only under "About Acme".
    expect(labels(analyzeJobMatch(emptyResume(), JDS.softwareEngineer))).not.toContain('AWS');
    // HubSpot is also a requirement, so it stays (it is in both).
    expect(analyzeJobMatch(emptyResume(), JDS.marketing).terms[0]).toMatchObject({ label: 'HubSpot', job: { sections: ['required', 'about'] } });
  });

  it('resume evidence: exact, aliases, punctuation and traps', () => {
    const jd = `${JDS.softwareEngineer}\n${JDS.dataAnalyst}`;
    expect(inResume(analyzeJobMatch(RESUMES.engineer, jd))).toEqual([
      'TypeScript', 'PostgreSQL', 'React', "Bachelor's degree", 'REST APIs', 'Microservices', 'Node.js', 'Kubernetes', 'Docker', 'CI/CD',
    ]);
    expect(inResume(analyzeJobMatch(RESUMES.aliases, jd)).sort()).toEqual(['A/B testing', 'Excel', 'Go', 'Kubernetes', 'Node.js', 'PostgreSQL', 'Power BI', 'React'].sort());
    expect(inResume(analyzeJobMatch(RESUMES.traps, JDS.traps))).toEqual(['JavaScript', 'MySQL', 'React Native']); // not Java, SQL or React
    expect(inResume(analyzeJobMatch(RESUMES.unicode, jd))).toEqual(['SQL', 'Python', 'REST APIs']);
    expect(inResume(analyzeJobMatch(RESUMES.empty, jd))).toEqual([]);
    expect(inResume(analyzeJobMatch(RESUMES.sample, jd))).toEqual(["Bachelor's degree", 'Microservices']);
  });

  it('records where in the resume each term appears', () => {
    const r = analyzeJobMatch(RESUMES.engineer, JDS.softwareEngineer);
    expect(r.terms.find((t) => t.id === 'typescript')!.resume).toEqual([
      { section: 'summary', label: 'Skill 1' },
      { section: 'experience', label: 'Experience 1 · Accomplishment 1' },
    ]);
    expect(r.title).toEqual({ text: 'Senior Software Engineer', core: 'Software Engineer', resume: [{ section: 'summary', label: 'Tagline' }, { section: 'experience', label: 'Experience 1 · Job Title' }] });
  });

  it('counts every term once, however often it is mentioned', () => {
    const r = analyzeJobMatch(RESUMES.engineer, 'SQL\nSQL and SQL\nStrong SQL skills');
    expect(r.terms).toHaveLength(1);
    expect(r.terms[0].job.mentions).toBe(3);
    expect(r.counts).toEqual({ inJob: 1, alsoInResume: 0 });
  });

  it('the name and contact details are not searched', () => {
    const data: ResumeData = { ...emptyResume(), name: 'Python Smith', contact: { ...emptyResume().contact, website: 'golang.dev', email: 'sql@x.io' } };
    expect(inResume(analyzeJobMatch(data, 'Python, Go and SQL'))).toEqual([]);
  });
});

// --- 4. no inference, no score ---

describe('no inference and no score', () => {
  it('the report has only textual facts: title, terms (mentions + evidence), counts', () => {
    const r = analyzeJobMatch(SAMPLE_RESUME, JDS.productManager);
    expect(Object.keys(r).sort()).toEqual(['counts', 'terms', 'title']);
    expect(Object.keys(r.terms[0]).sort()).toEqual(['category', 'id', 'job', 'label', 'resume']);
    expect(Object.keys(r.counts).sort()).toEqual(['alsoInResume', 'inJob']);
    // The category name "qualification" (degree level) is a label, not a claim about the user.
    const text = JSON.stringify(r).replace(/"category":"[a-z]+"/g, '');
    expect(text).not.toMatch(/percent|score|qualif|\bfit\b|years|level|senior|missing/i);
  });

  it('the screen copy never claims fit, qualification, percentages or outcomes', () => {
    const copy = JSON.stringify({ MATCH_COPY, SECTION_LABELS });
    expect(copy).not.toMatch(/%|qualified|strong candidate|will pass|interview|you (don't|do not) have|you lack(?! the skill)/i);
    expect(MATCH_COPY.notDetectedMeaning).toMatch(/only means these words were not found.*does not mean you lack the skill/i);
    expect(countsLine(12, 8)).toBe('12 job terms detected · 8 also found in your resume');
    expect(countsLine(1, 0)).toBe('1 job term detected · 0 also found in your resume');
    expect(mentionedUnder(['required', 'preferred'], 2)).toBe('Mentioned under Requirements, Nice to have (2 lines)');
    const screen = read('features/job-match/MatchTool.tsx');
    expect(screen).not.toMatch(/matchPercent|%\s*<|}%/);
  });
});

// --- 5. limits, empty and malformed input ---

describe('limits and edge input', () => {
  it('25,000 characters accepted, 25,001 refused', () => {
    expect(() => analyzeJobMatch(SAMPLE_RESUME, 'a'.repeat(JOB_DESCRIPTION_MAX))).not.toThrow();
    expect(() => analyzeJobMatch(SAMPLE_RESUME, 'a'.repeat(JOB_DESCRIPTION_MAX + 1))).toThrow(JobDescriptionTooLongError);
  });

  it('empty, whitespace or non-string job descriptions give an empty report', () => {
    for (const jd of ['', '   \n\t ', undefined, null, 42]) {
      expect(analyzeJobMatch(SAMPLE_RESUME, jd as unknown as string)).toEqual({ title: null, terms: [], counts: { inJob: 0, alsoInResume: 0 } });
    }
  });

  it('malformed resume data is repaired first', () => {
    const broken = { summary: { skills: 'x' }, experience: [null, { bullets: ['Python'] }] } as unknown as ResumeData;
    expect(inResume(analyzeJobMatch(broken, 'Python'))).toEqual(['Python']);
  });
});

// --- 6. properties ---

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
}
const PIECES = ['Python', 'JavaScript', 'Java', 'C', 'C++', 'R', 'Go', 'rest', 'REST', 'Excel', 'excel at', 'SQL', 'MySQL', 'React Native',
  'Requirements', 'Nice to have:', 'About us:', ',', ' and ', '\n', '.', 'Senior Engineer', 'é', '🚀', 'AWS', 'K8s', '-', '/', '(', ')'];
function text(r: () => number, n: number) {
  return Array.from({ length: n }, () => PIECES[Math.floor(r() * PIECES.length)]).join(r() > 0.5 ? ' ' : '');
}

describe('properties (fixed-seed generated input)', () => {
  const r = rng(7);
  const cases = Array.from({ length: 300 }, () => ({
    jd: text(r, 3 + Math.floor(r() * 30)),
    data: { ...emptyResume(), summary: { tagline: text(r, 4), bullets: [text(r, 5)], skills: [text(r, 1), text(r, 2)] }, experience: [{ ...emptyResume().experience[0] ?? { title: '', company: '', location: '', start: '', end: '', summary: '', bullets: [] }, title: text(r, 3), bullets: [text(r, 6)] }] } as ResumeData,
  }));

  it('never throws; ids are listed and unique; counts agree; evidence points to real sections', () => {
    const known = new Set(TAXONOMY.map((t) => t.id));
    for (const { jd, data } of cases) {
      const rep = analyzeJobMatch(data, jd);
      expect(new Set(rep.terms.map((t) => t.id)).size).toBe(rep.terms.length);
      for (const t of rep.terms) {
        expect(known.has(t.id)).toBe(true);
        expect(t.job.mentions).toBeGreaterThanOrEqual(1);
        expect(t.job.sections.some((s) => s !== 'about')).toBe(true);
        for (const e of t.resume) expect(EDITOR_SECTIONS).toContain(e.section);
      }
      expect(rep.counts).toEqual({ inJob: rep.terms.length, alsoInResume: rep.terms.filter((t) => t.resume.length).length });
    }
  });

  it('every hit is a whole token: never inside a longer word or name', () => {
    for (const { jd } of cases) {
      for (const line of jd.split('\n')) {
        for (const h of findHits(line)) {
          expect(/[A-Za-z0-9+#]/.test(line[h.start - 1] ?? ' '), `${line} @${h.start}`).toBe(false);
          expect(/[A-Za-z0-9+#]/.test(line[h.end] ?? ' '), `${line} @${h.end}`).toBe(false);
        }
      }
    }
  });

  it('is deterministic and does not modify its input', () => {
    for (const { jd, data } of cases.slice(0, 80)) {
      const before = JSON.stringify(data);
      expect(analyzeJobMatch(data, jd)).toEqual(analyzeJobMatch(data, jd));
      expect(JSON.stringify(data)).toBe(before);
    }
  });
});

describe('taxonomy integrity', () => {
  it('versioned; unique ids; no spelling belongs to two terms', () => {
    expect(TAXONOMY_VERSION).toBe(1);
    expect(new Set(TAXONOMY.map((t) => t.id)).size).toBe(TAXONOMY.length);
    const owners = new Map<string, string>();
    for (const term of TAXONOMY) {
      expect(term.aliases.length + (term.patterns?.length ?? 0), term.id).toBeGreaterThan(0);
      for (const alias of term.aliases) {
        const key = term.caseSensitive ? alias : alias.toLowerCase();
        expect(owners.get(key), `${alias} in ${term.id} and ${owners.get(key)}`).toBeUndefined();
        owners.set(key, term.id);
      }
    }
    // Every gated spelling is one of the term's own aliases.
    for (const term of TAXONOMY) for (const g of [...(term.listContext ?? []), ...(term.notSentenceStart ?? [])]) expect(term.aliases).toContain(g);
  });
});

// --- 7. gating ---

const T = 1_700_000_000_000;
function world(premium: boolean) {
  const store = new FakeStoreProvider({ storeNow: () => T });
  if (premium) store.setSubscription('active', T + 86_400_000);
  const entitlements = new EntitlementService(store, new MemoryEntitlementCacheStore(), () => T);
  return { store, tools: new PremiumTools(new PremiumGate(entitlements)), paywall: new PaywallCoordinator(entitlements) };
}

describe('PREMIUM gating (plan §4.2: Job Match is PREMIUM)', () => {
  it('FREE: refused before any analysis (even for input the engine would refuse)', async () => {
    const free = world(false);
    await expect(free.tools.jobMatch(SAMPLE_RESUME, JDS.dataAnalyst)).rejects.toEqual(new PremiumRequiredError('jobMatch'));
    await expect(free.tools.jobMatch(SAMPLE_RESUME, 'x'.repeat(JOB_DESCRIPTION_MAX + 1))).rejects.toEqual(new PremiumRequiredError('jobMatch'));
  });

  it('PREMIUM: one entitlement check, then the report', async () => {
    const paid = world(true);
    const before = paid.store.calls.verify;
    const report = await paid.tools.jobMatch(SAMPLE_RESUME, JDS.productManager);
    expect(paid.store.calls.verify - before).toBe(1);
    expect(report).toEqual(analyzeJobMatch(SAMPLE_RESUME, JDS.productManager));
  });

  it('a refused comparison resumes through the existing paywall after subscribing', async () => {
    const w = world(false);
    let report: JobMatchReport | null = null;
    const run = async () => void (report = await w.tools.jobMatch(SAMPLE_RESUME, JDS.short));
    await run().catch((e) => e instanceof PremiumRequiredError && w.paywall.request({ feature: e.feature, run }));
    expect(w.paywall.pendingFeature()).toBe('jobMatch');
    await (await w.paywall.subscribe()).resume!();
    expect(report!.terms.map((t) => t.label)).toEqual(['Python']);
  });
});

// --- 8. architecture ---

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.generated.ts') ? [path] : [];
  });
}
const valueImports = (source: string) => [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]);

describe('architecture', () => {
  it('domain/job-match is pure', () => {
    for (const file of sourceFiles(join(SRC, 'domain', 'job-match'))) {
      for (const spec of [...read(relative(SRC, file)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])) {
        expect(spec, relative(SRC, file)).toMatch(/^\.\/[\w-]+$|^\.\.\/(resume)\/[\w-]+$|^\.\.\/ats\/fields$/);
      }
    }
  });

  it('only PremiumTools runs the engine; the screen goes through it; the old frequency matcher is gone', () => {
    const runners = sourceFiles(SRC)
      .filter((f) => !f.includes(join('domain', 'job-match')))
      .filter((f) => valueImports(readFileSync(f, 'utf8')).some((s) => /domain\/job-match\/job-match$/.test(s)))
      .map((f) => relative(SRC, f));
    expect(runners).toEqual([join('services', 'premium', 'premium-tools.ts')]);
    const screen = read('features/job-match/MatchTool.tsx');
    expect(screen).toContain('tools.jobMatch(');
    expect(screen).not.toMatch(/analyzeJobMatch|findHits/);
    expect(() => statSync(join(SRC, 'domain', 'match', 'job-match.ts'))).toThrow();
  });

  it('Resume Score (step 7) and the ATS checker (step 9) do not use job match', () => {
    for (const file of ['domain/check/resume-score.ts', 'features/check/CheckTool.tsx', 'domain/ats/ats.ts', 'domain/ats/rules.ts']) {
      expect(read(file), file).not.toMatch(/job-match/);
    }
  });
});

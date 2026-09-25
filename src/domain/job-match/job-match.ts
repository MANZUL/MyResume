import { textFields } from '../ats/fields';
import { normalizeResumeData } from '../resume/normalize';
import type { ResumeData } from '../resume/types';
import { findHits, termById } from './matcher';
import { detectTitle, segmentJobDescription, type JdSection } from './segment';
import { JOB_DESCRIPTION_MAX, JobDescriptionTooLongError, type Evidence, type JobMatchReport, type JobTerm } from './types';

// Job Description → Resume match. Deterministic and local:
//   1. the posting is split into lines labelled by section;
//   2. listed taxonomy terms are found in it (boundary-aware, longest match wins);
//   3. terms mentioned only under "About the company" are dropped (company and product names);
//   4. each remaining term is looked up in the resume's own text, recording where it appears.
// Nothing is inferred: "not detected" means only that the words were not found.

const SECTION_ORDER: readonly JdSection[] = ['required', 'responsibilities', 'general', 'preferred', 'about'];

export function analyzeJobMatch(input: ResumeData, jobDescription: string): JobMatchReport {
  const jd = typeof jobDescription === 'string' ? jobDescription : '';
  if (jd.length > JOB_DESCRIPTION_MAX) throw new JobDescriptionTooLongError();
  const data = normalizeResumeData(input);

  // 1–2. Terms in the posting.
  const seen = new Map<string, { mentions: number; sections: Set<JdSection>; first: number }>();
  segmentJobDescription(jd).forEach((line, index) => {
    const ids = new Set(findHits(line.text).map((h) => h.termId));
    for (const id of ids) {
      const entry = seen.get(id) ?? { mentions: 0, sections: new Set<JdSection>(), first: index };
      entry.mentions += 1;
      entry.sections.add(line.section);
      seen.set(id, entry);
    }
  });

  // 4. The same terms in the resume (content fields only; the name and contact details are not searched).
  const evidence = new Map<string, Evidence[]>();
  const fields = textFields(data).filter((f) => f.kind !== 'name' && f.kind !== 'contact');
  for (const field of fields) {
    for (const line of field.value.split(/\r?\n/)) {
      for (const hit of findHits(line, { skillEntry: field.kind === 'skill' })) {
        const list = evidence.get(hit.termId) ?? [];
        if (!list.some((e) => e.label === field.location.label)) list.push({ section: field.location.section, label: field.location.label });
        evidence.set(hit.termId, list);
      }
    }
  }

  const rank = (sections: Set<JdSection>) => Math.min(...[...sections].map((s) => SECTION_ORDER.indexOf(s)));
  const terms: JobTerm[] = [...seen.entries()]
    // 3. Only mentioned in "About the company": likely the employer's own name or product.
    .filter(([, e]) => [...e.sections].some((s) => s !== 'about'))
    .sort(([, a], [, b]) => rank(a.sections) - rank(b.sections) || a.first - b.first)
    .map(([id, e]) => {
      const term = termById(id)!;
      return {
        id,
        label: term.label,
        category: term.category,
        job: { mentions: e.mentions, sections: SECTION_ORDER.filter((s) => e.sections.has(s)) },
        resume: evidence.get(id) ?? [],
      };
    });

  // The role name, and where it appears in the resume (titles, tagline, summaries).
  const detected = detectTitle(jd);
  let title: JobMatchReport['title'] = null;
  if (detected) {
    const words = detected.core.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(?<![A-Za-z0-9])${words.join('[\\s-]+')}(?:e?s)?(?![A-Za-z0-9])`, 'i');
    const where: Evidence[] = [];
    for (const field of fields) {
      if (field.kind === 'item' || field.kind === 'skill' || field.kind === 'date') continue;
      if (regex.test(field.value) && !where.some((w) => w.label === field.location.label)) {
        where.push({ section: field.location.section, label: field.location.label });
      }
    }
    title = { text: detected.text, core: detected.core, resume: where };
  }

  return { title, terms, counts: { inJob: terms.length, alsoInResume: terms.filter((t) => t.resume.length > 0).length } };
}

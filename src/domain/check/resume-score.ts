import { englishText } from '../../i18n/analysis';
import { analysisSupport, type LanguageSupport } from '../i18n/analysis-support';
import { text, type AnalysisText } from '../i18n/analysis-text';
import type { Language } from '../i18n/languages';
import type { EditorSection } from '../resume/sections';
import type { ResumeData } from '../resume/types';

export type ResumeScoreWarning = {
  id: string;
  /** English rendering of `messageText`. */
  message: string;
  messageText: AnalysisText;
  /** The editor section the "Improve" link opens. */
  section: Extract<EditorSection, 'personal' | 'summary' | 'experience' | 'education' | 'projects'>;
};

export type ResumeScore = {
  /** Which rules produced this score for the resume's language. */
  support: LanguageSupport;
  score: number;
  /** English renderings of `strengthTexts`. */
  strengths: string[];
  strengthTexts: AnalysisText[];
  warnings: ResumeScoreWarning[];
  categories: { label: string; labelText: AnalysisText; status: 'Strong' | 'Needs attention' }[];
};

// Messages are codes (analysis.score.* in the app catalog); the English strings are
// rendered from the same entries.
const W = (key: string, params?: Record<string, number>) => text(`analysis.score.warnings.${key}`, params);
const S = (key: string) => text(`analysis.score.strengths.${key}`);
const warning = (id: string, value: AnalysisText, section: ResumeScoreWarning['section']): ResumeScoreWarning => ({
  id,
  message: englishText(value),
  messageText: value,
  section,
});
const category = (key: string, status: 'Strong' | 'Needs attention') => {
  const labelText = text(`analysis.score.categories.${key}`);
  return { label: englishText(labelText), labelText, status };
};

const actionVerbs = new Set([
  'built', 'created', 'designed', 'developed', 'drove', 'grew', 'improved',
  'increased', 'launched', 'led', 'managed', 'owned', 'reduced', 'spearheaded',
  'implemented', 'delivered', 'analyzed', 'organized', 'partnered', 'coordinated',
]);

/**
 * Resume Score. The rules (action verbs, summary length, bullet length) and messages are
 * English; for other resume languages they still run, reported as 'english-rules'.
 */
export function scoreResume(data: ResumeData, language: Language): ResumeScore {
  const warnings: ResumeScoreWarning[] = [];
  const strengthTexts: AnalysisText[] = [];
  const strengths = { push: (key: string) => strengthTexts.push(S(key)) };
  let score = 0;

  const contactFields = [
    data.contact.email,
    data.contact.phone,
    data.contact.location,
    data.contact.linkedin || data.contact.website,
  ].filter(Boolean).length;
  score += Math.min(contactFields * 4, 16);
  if (contactFields >= 3) strengths.push('contact');
  else warnings.push(warning('contact', W('contact'), 'personal'));

  const summaryText = [
    data.summary.tagline,
    ...data.summary.bullets,
  ].filter(Boolean).join(' ');
  if (summaryText.length >= 80) {
    score += 10;
    strengths.push('summary');
  } else if (summaryText) {
    score += 5;
    warnings.push(warning('summary-length', W('summaryLength'), 'summary'));
  } else {
    warnings.push(warning('summary', W('summary'), 'summary'));
  }

  if (data.experience.length > 0) {
    score += 15;
    const bulletCount = data.experience.reduce((count, item) => count + item.bullets.filter(Boolean).length, 0);
    const vagueCount = data.experience.reduce(
      (count, item) => count + item.bullets.filter((bullet) => bullet.trim().split(/\s+/).length < 6).length,
      0,
    );
    if (bulletCount >= 3) score += 5;
    if (vagueCount > 0) {
      warnings.push(warning('short-bullets', W('shortBullets', { count: vagueCount }), 'experience'));
    } else {
      strengths.push('experience');
    }
  } else {
    warnings.push(warning('experience', W('experience'), 'experience'));
  }

  if (data.education.length > 0) {
    score += 8;
    strengths.push('education');
  } else {
    warnings.push(warning('education', W('education'), 'education'));
  }

  if (data.summary.skills.filter(Boolean).length >= 3) {
    score += 10;
    strengths.push('skills');
  } else {
    warnings.push(warning('skills', W('skills'), 'summary'));
  }

  if (data.projects.length > 0) score += 5;

  const bullets = [
    ...data.summary.bullets,
    ...data.experience.flatMap((item) => item.bullets),
    ...data.projects.flatMap((item) => item.bullets),
  ].filter(Boolean);
  const verbCount = bullets.filter((bullet) => actionVerbs.has((bullet.trim().split(/\s+/)[0] ?? '').toLowerCase())).length;
  const writingReady = bullets.length > 0 &&
    verbCount / bullets.length >= 0.4 &&
    bullets.every((bullet) => bullet.trim().split(/\s+/).length <= 32);
  if (bullets.length > 0 && verbCount / bullets.length >= 0.4) {
    score += 8;
    strengths.push('actionVerbs');
  } else if (bullets.length > 0) {
    warnings.push(warning('action-verbs', W('actionVerbs'), 'experience'));
  }

  if (bullets.length > 0 && bullets.every((bullet) => bullet.trim().split(/\s+/).length <= 32)) {
    score += 8;
    strengths.push('bulletLength');
  } else if (bullets.length > 0) {
    warnings.push(warning('long-bullets', W('longBullets'), 'experience'));
  }

  score += 15; // Standard headings and the plain-text template system are ATS-friendly by design.
  strengths.push('structure');

  const shownStrengths = strengthTexts.filter((s, i) => strengthTexts.findIndex((o) => o.code === s.code) === i).slice(0, 5);
  return {
    support: analysisSupport('resumeScore', language),
    score: Math.min(score, 100),
    strengths: shownStrengths.map((s) => englishText(s)),
    strengthTexts: shownStrengths,
    warnings: warnings.slice(0, 6),
    categories: [
      category('content', contactFields >= 3 && summaryText.length >= 80 && data.experience.length > 0 ? 'Strong' : 'Needs attention'),
      category(
        'structure',
        data.experience.length > 0 && data.education.length > 0 && data.summary.skills.filter(Boolean).length >= 3 ? 'Strong' : 'Needs attention',
      ),
      category('writing', writingReady ? 'Strong' : 'Needs attention'),
      category('ats', 'Strong'),
    ],
  };
}
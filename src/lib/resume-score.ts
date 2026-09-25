import type { ResumeData } from './types';

export type ResumeScoreWarning = {
  id: string;
  message: string;
  section: 'personal' | 'summary' | 'experience' | 'education' | 'projects';
};

export type ResumeScore = {
  score: number;
  strengths: string[];
  warnings: ResumeScoreWarning[];
  categories: { label: string; status: 'Strong' | 'Needs attention' }[];
};

const actionVerbs = new Set([
  'built', 'created', 'designed', 'developed', 'drove', 'grew', 'improved',
  'increased', 'launched', 'led', 'managed', 'owned', 'reduced', 'spearheaded',
  'implemented', 'delivered', 'analyzed', 'organized', 'partnered', 'coordinated',
]);

export function scoreResume(data: ResumeData): ResumeScore {
  const warnings: ResumeScoreWarning[] = [];
  const strengths: string[] = [];
  let score = 0;

  const contactFields = [
    data.contact.email,
    data.contact.phone,
    data.contact.location,
    data.contact.linkedin || data.contact.website,
  ].filter(Boolean).length;
  score += Math.min(contactFields * 4, 16);
  if (contactFields >= 3) strengths.push('Clear contact information');
  else warnings.push({ id: 'contact', message: 'Add a reliable email, phone, and location.', section: 'personal' });

  const summaryText = [
    data.summary.tagline,
    ...data.summary.bullets,
  ].filter(Boolean).join(' ');
  if (summaryText.length >= 80) {
    score += 10;
    strengths.push('Focused summary');
  } else if (summaryText) {
    score += 5;
    warnings.push({ id: 'summary-length', message: 'The summary could be more specific and complete.', section: 'summary' });
  } else {
    warnings.push({ id: 'summary', message: 'Add a short summary that positions you for the role.', section: 'summary' });
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
      warnings.push({
        id: 'short-bullets',
        message: `${vagueCount} experience bullet${vagueCount === 1 ? '' : 's'} could be stronger.`,
        section: 'experience',
      });
    } else {
      strengths.push('Experience has useful detail');
    }
  } else {
    warnings.push({ id: 'experience', message: 'Add at least one experience entry if applicable.', section: 'experience' });
  }

  if (data.education.length > 0) {
    score += 8;
    strengths.push('Education section is present');
  } else {
    warnings.push({ id: 'education', message: 'Add education or training if relevant to this role.', section: 'education' });
  }

  if (data.summary.skills.filter(Boolean).length >= 3) {
    score += 10;
    strengths.push('Skills are easy to find');
  } else {
    warnings.push({ id: 'skills', message: 'Add several relevant skills you genuinely have.', section: 'summary' });
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
    strengths.push('Good use of action verbs');
  } else if (bullets.length > 0) {
    warnings.push({ id: 'action-verbs', message: 'Several bullets could start with clearer action verbs.', section: 'experience' });
  }

  if (bullets.length > 0 && bullets.every((bullet) => bullet.trim().split(/\s+/).length <= 32)) {
    score += 8;
    strengths.push('Readable bullet length');
  } else if (bullets.length > 0) {
    warnings.push({ id: 'long-bullets', message: 'Shorten long bullets so key outcomes are easier to scan.', section: 'experience' });
  }

  score += 15; // Standard headings and the plain-text template system are ATS-friendly by design.
  strengths.push('ATS-friendly structure');

  return {
    score: Math.min(score, 100),
    strengths: Array.from(new Set(strengths)).slice(0, 5),
    warnings: warnings.slice(0, 6),
    categories: [
      {
        label: 'Content',
        status: contactFields >= 3 && summaryText.length >= 80 && data.experience.length > 0
          ? 'Strong'
          : 'Needs attention',
      },
      {
        label: 'Structure',
        status: data.experience.length > 0 && data.education.length > 0 && data.summary.skills.filter(Boolean).length >= 3
          ? 'Strong'
          : 'Needs attention',
      },
      {
        label: 'Writing',
        status: writingReady ? 'Strong' : 'Needs attention',
      },
      {
        label: 'ATS readability',
        status: 'Strong',
      },
    ],
  };
}
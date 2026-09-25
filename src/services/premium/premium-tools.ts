import { analyzeText, applyFix, buildCoachContext } from '../../domain/coach/coach';
import type { CoachField, CoachFinding, CoachReport } from '../../domain/coach/types';
import { PremiumRequiredError } from '../../domain/entitlement/features';
import { matchJob, type JobMatch } from '../../domain/match/job-match';
import type { ResumeData } from '../../domain/resume/types';
import type { PremiumGate } from '../entitlement/premium-gate';

// Premium tools enforce the entitlement here, in the service, before running.

export class FeatureNotAvailableYetError extends Error {
  constructor(readonly feature: string) {
    super(`${feature} is not available yet.`);
    this.name = 'FeatureNotAvailableYetError';
  }
}

export class PremiumTools {
  constructor(private readonly gate: PremiumGate) {}

  async jobMatch(data: ResumeData, jobDescription: string): Promise<JobMatch> {
    await this.gate.require('jobMatch');
    return matchJob(data, jobDescription);
  }

  /** Tailoring suggestions arrive in migration step 10; the premium check is already the entry point. */
  async tailoring(_data: ResumeData, _jobDescription: string): Promise<never> {
    await this.gate.require('tailoring');
    throw new FeatureNotAvailableYetError('Tailoring');
  }

  /**
   * Writing Coach analysis (step 8). Checked before any analysis runs, so FREE users
   * get nothing about their text. `siblings` are the entry's other bullets, read-only.
   */
  async writingCoach(text: string, field: CoachField, siblings: readonly string[] = []): Promise<CoachReport> {
    await this.gate.require('coach');
    return analyzeText(text, buildCoachContext(field, siblings));
  }

  /**
   * Applies one Coach suggestion. Checked again here: if premium was lost since the
   * analysis, nothing changes. The engine then rejects stale or ungrounded fixes.
   */
  async applyCoachFix(
    text: string,
    field: CoachField,
    siblings: readonly string[],
    finding: CoachFinding,
    choice?: number,
  ): Promise<string> {
    await this.gate.require('coach');
    return applyFix(text, buildCoachContext(field, siblings), finding, choice);
  }
}

export { PremiumRequiredError };

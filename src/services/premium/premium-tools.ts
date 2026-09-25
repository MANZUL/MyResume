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

  /** Writing Coach arrives in migration step 8; the premium check is already the entry point. */
  async writingCoach(_text: string): Promise<never> {
    await this.gate.require('coach');
    throw new FeatureNotAvailableYetError('Writing Coach');
  }
}

export { PremiumRequiredError };

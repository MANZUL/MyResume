import { isFreeAccent } from '../../domain/entitlement/palette';
import { isHexColor } from '../../domain/shared/text';
import type { PremiumGate } from '../entitlement/premium-gate';

export interface AccentTarget {
  update(id: string, patch: { accent: string }): void;
}

/**
 * Template customization rules. The default color and the 8 presets are FREE;
 * any other (custom) color needs premium. The check runs here, not in the UI.
 */
export class CustomizationService {
  constructor(
    private readonly gate: PremiumGate,
    private readonly resumes: AccentTarget,
  ) {}

  async setAccent(resumeId: string, templateId: string, accent: string): Promise<void> {
    if (!isHexColor(accent)) throw new Error('Choose a valid color.');
    if (!isFreeAccent(templateId, accent)) await this.gate.require('customize.customAccent');
    this.resumes.update(resumeId, { accent });
  }
}

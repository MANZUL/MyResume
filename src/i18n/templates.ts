import { getTemplate, type TemplateCategory } from '../domain/templates/templates';
import type { MessageKey } from './catalog';
import type { Translator } from './translate';

export interface TemplateText {
  name: string;
  shortName: string;
  description: string;
  category: string;
}

/** A template's display text in the translator's language (unknown ids use the default template). */
export function templateText(t: Translator['t'], templateId: string): TemplateText {
  const config = getTemplate(templateId);
  return {
    name: t(config.nameKey as MessageKey),
    shortName: t(config.shortNameKey as MessageKey),
    description: t(config.descriptionKey as MessageKey),
    category: t(config.categoryKey as MessageKey),
  };
}

export function categoryName(t: Translator['t'], category: TemplateCategory): string {
  return t(`templates.categories.${category}` as MessageKey);
}

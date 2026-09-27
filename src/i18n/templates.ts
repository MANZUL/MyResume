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
  const key = (field: 'name' | 'shortName' | 'description') => `templates.${config.id}.${field}` as MessageKey;
  return {
    name: t(key('name')),
    shortName: t(key('shortName')),
    description: t(key('description')),
    category: categoryName(t, config.category),
  };
}

export function categoryName(t: Translator['t'], category: TemplateCategory): string {
  return t(`templates.categories.${category}` as MessageKey);
}

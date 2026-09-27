import type { LanguageSupport } from '../../domain/i18n/analysis-support';
import { LANGUAGE_NAMES } from '../../domain/i18n/languages';
import { useT } from '../../services/i18n/localization';
import { Card, Muted } from '../../ui/components';

/**
 * Shown above results an engine produced with English rules for a resume in another
 * language. Nothing is shown for native support, so English resumes look as before.
 */
export function EnglishRulesNote({ support }: { support: LanguageSupport }) {
  const t = useT();
  if (support.kind !== 'english-rules') return null;
  return (
    <Card>
      <Muted>{t('tools.englishRules', { language: LANGUAGE_NAMES[support.language] })}</Muted>
    </Card>
  );
}

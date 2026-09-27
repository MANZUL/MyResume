import type { AnalysisText } from '../domain/i18n/analysis-text';
import type { MessageKey } from './catalog';
import { createTranslator, type MessageParams, type Translator } from './translate';

/** Renders a coded analysis text (and any coded parameters) with a translator. */
export function renderText(t: Translator['t'], value: AnalysisText): string {
  const params: MessageParams = {};
  for (const [name, param] of Object.entries(value.params ?? {})) {
    params[name] = typeof param === 'object' ? renderText(t, param) : param;
  }
  return t(value.code as MessageKey, params);
}

// The English rule packs still return an English `message` next to each code. It is
// rendered here from the same English catalog (so there is one source of English text),
// exactly as the rules wrote it before codes: no isolation marks, no number grouping.
const english = createTranslator('en', undefined, { isolate: false, formatNumbers: false });
const englishFormatted = createTranslator('en', undefined, { isolate: false });

/** English text of a code. `formatNumbers` groups digits ("25,000") where the old text did. */
export function englishText(value: AnalysisText, options: { formatNumbers?: boolean } = {}): string {
  return renderText((options.formatNumbers ? englishFormatted : english).t, value);
}

/**
 * The user-facing text of an error: its code when the app's own code raised it (in the
 * app language); otherwise the error's own message, or the fallback message.
 */
export function errorText(t: Translator['t'], error: unknown, fallback: MessageKey): string {
  const coded = (error as { messageText?: AnalysisText } | null)?.messageText;
  if (coded && typeof coded.code === 'string') return renderText(t, coded);
  return error instanceof Error ? error.message : t(fallback);
}

// Direction helpers for text that mixes scripts inside a right-to-left document. They only
// decide WHERE a document renderer puts its direction marks or isolates; the user's text is
// never changed.
//
// Why it matters: in an Arabic sentence the "++" of "C++" (and a final period, or the "#" of
// "C#") sits between a Latin letter and Arabic text. Bidirectional text rules give such
// neutral characters the paragraph direction, so it displays as "++C". Wrapping the whole
// Latin run in a left-to-right isolate (HTML) or left-to-right marks (DOCX) keeps it intact.

/** The first letter is Latin, Greek or Cyrillic: the text reads left-to-right as a whole. */
export const FIRST_LETTER_LTR = /^[^\p{L}]*[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
const HAS_RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const HAS_LATIN_LETTER = /\p{Script=Latin}/u;

// A Latin "word" for this purpose: starts with a letter or digit (optionally a leading dot,
// as in ".NET"), may contain . _ % / @ : # + & ' - inside, and ends on a letter, digit or one
// of % + # (so "C++" and "C#" keep their symbols but a sentence's final period stays out).
const WORD = "\\.?[\\p{Script=Latin}\\d](?:[\\p{Script=Latin}\\d._%/@:#+&'-]*[\\p{Script=Latin}\\d%+#])?";
const LATIN_RUN = new RegExp(`${WORD}(?: ${WORD})*`, 'gu');

/**
 * Wraps every Latin run (at least one Latin letter: "C++", "AWS Lambda", "e-Commerce",
 * "Node.js", "3x", a URL) of Arabic-first mixed text through `wrap`; everything else goes
 * through `plain`. Text that is not Arabic-first, or has no Latin letters, is passed whole.
 */
export function mapLatinRuns(text: string, plain: (s: string) => string, wrap: (s: string) => string): string {
  if (!text || FIRST_LETTER_LTR.test(text) || !HAS_RTL_LETTER.test(text) || !HAS_LATIN_LETTER.test(text)) return plain(text);
  let out = '';
  let last = 0;
  for (const match of text.matchAll(LATIN_RUN)) {
    if (!HAS_LATIN_LETTER.test(match[0])) continue;
    out += plain(text.slice(last, match.index)) + wrap(match[0]);
    last = match.index + match[0].length;
  }
  return out + plain(text.slice(last));
}

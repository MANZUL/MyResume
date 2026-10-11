// Limits for pasted resume text (Import). A resume is short: one to four pages are about
// 2,000 to 10,000 characters, and a long academic CV of many pages stays under 25,000. The
// limit is 30,000 characters, a little above that and above the 25,000-character job
// description limit, so no real resume is refused. The same limit is enforced by the screen
// (it tells the user) and by the parser (it refuses, so no caller can bypass the screen).
//
// Oversized text is REFUSED, never truncated: cutting a resume off at an arbitrary point
// would silently drop experience or education.

export const IMPORT_MAX_CHARS = 30_000;

export class ImportTooLongError extends Error {
  readonly max = IMPORT_MAX_CHARS;
  constructor() {
    super(`The text is longer than ${IMPORT_MAX_CHARS} characters.`);
    this.name = 'ImportTooLongError';
  }
}

/** True when the text may be imported (the length is counted in UTF-16 units, as typed). */
export function isImportable(raw: string): boolean {
  return raw.length <= IMPORT_MAX_CHARS;
}

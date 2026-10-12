# My Resume

A mobile resume builder for iOS and Android, built with Expo and React Native.

- **Free.** There is no subscription, purchase, paywall, entitlement, price or billing code.
- **Offline-first.** Everything runs on the device. There is no backend, account, login, cloud sync or analytics.
- **No AI.** Every checker, suggestion and parser is deterministic rules running on the device.
- **Your data stays local.** Resumes are stored in an on-device SQLite database. The only ways data leaves the
  app are actions the user starts: exporting a file, sharing a backup, copying or sharing a cover letter.

> **Status.** The code is feature-complete for the planned scope and has **not** been validated on real
> devices. Typecheck, lint, the test suite and the iOS/Android bundle exports pass, but **a successful bundle
> export proves only that the JavaScript compiles and bundles. It does not prove that the app, its exports, the
> share sheet or the file picker work on a real iPhone or Android phone.** Device validation is the last
> project phase (Phase 21) and has not been done. See [Known limitations](#known-limitations-and-not-implemented).

## What the app does

| Area | What is implemented |
|---|---|
| Resumes | Create (from a template, blank, the English sample, or pasted text), edit, duplicate, delete, reopen. Seven editor sections: personal information, summary and skills, experience, education, certifications, projects, awards. |
| Autosave | Edits are saved to SQLite automatically (600 ms after typing stops, at most every 3 s while typing, and when you leave a screen or the app goes to the background). A failed save, load or delete is shown with a Retry action; nothing is reported as saved before SQLite confirms it. |
| Templates | 12 designs in 6 categories (Corporate, Tech, Creative, Healthcare, Academic, Trades), a gallery, a template preview, 8 preset accent colors plus any custom six-digit hex color. |
| Preview | An in-app preview of the real renderer output at the selected paper size. |
| Export | PDF, Word (.docx) and image (PNG, one file per page) through the system share sheet. Letter or A4, chosen on the Preview screen. |
| Resume Score | A 0–100 score with strengths, warnings and jump-to-section. |
| Writing Coach | Rule-based suggestions with safe one-tap fixes. It never adds facts, numbers or skills. English resumes only. |
| ATS Readability | Checks what an applicant tracking system can read (contact details, headings, characters, dates, bullets, template text). It makes no guarantee about any ATS. |
| Job Match | Compares a pasted job description with the resume by listed skills, tools, certifications and degrees. Counts only: no percentage and no fit judgment. English taxonomy. |
| Cover Letter | A fill-in-the-blanks draft built only from the resume's own facts. The draft is always English. |
| Import | Sorts pasted resume text into sections on the device. English section headings only; up to 30,000 characters. |
| Backup / Restore | One JSON file with all resumes. See [Backup and restore](#backup-and-restore). |
| Languages | English, German, French, Spanish, Arabic (right-to-left). See [Languages](#languages). |

## Languages

There are two independent language settings:

- **App language**: buttons, menus and messages. Chosen on the Language screen (Home, header). Before a choice
  is made, the device language is used if it is one of the five, otherwise English.
- **Resume language**: stored per resume and chosen in the editor. It sets the document's headings, direction
  (right-to-left for Arabic) and typography in the preview and in PDF, Word and image exports. It is never
  guessed from the text, and changing the app language never changes a resume.

Arabic changes the app layout direction. React Native applies a direction change only after the app is closed
and reopened, so the app shows a notice when a restart is needed. It does not restart itself.

The analysis tools use English rules and English wording whatever the language (Score, ATS, Job Match, Cover
Letter, Import); the app says so on those screens, and the Writing Coach is switched off for non-English
resumes. The five languages are fully localized in the UI, but not analyzed linguistically.

The app declares the five languages to iOS (`CFBundleLocalizations`) and, through Expo's `locales`, creates
per-language resources for iOS and Android. It does not offer Android 13's per-app language setting.

## Run it

**Prerequisites:** Node.js 22 (the tests use `node:sqlite`), npm 10 and the committed `package-lock.json`.
Running the app on a device or emulator additionally needs the platform toolchains (Xcode for iOS, the Android
SDK for Android), because the app uses a development build, not Expo Go.

```bash
npm install            # also runs the postinstall step (see below)
npm test               # vitest run
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
```

Production bundle exports (JavaScript bundle only: no native build, no credentials):

```bash
npx expo export --platform ios     --output-dir <dir> --clear
npx expo export --platform android --output-dir <dir> --clear
```

Other scripts from `package.json`:

| Script | Command |
|---|---|
| `npm start` | `expo start` |
| `npm run android` / `npm run ios` | `expo run:android` / `expo run:ios` (local native build and run) |
| `npm run thumbnails` | `UPDATE_THUMBNAILS=1 vitest run src/__tests__/template-gallery.test.ts` (regenerates the gallery thumbnails; needs Chromium) |

**The `postinstall` step is required.** `scripts/pdfjs-source.mjs` generates
`src/services/export/rasterizer/pdfjs-source.generated.ts` (the offline pdf.js page used for image export)
from the installed `pdfjs-dist`. The file is git-ignored. Without it, typecheck, the tests and the bundle
fail. Use `npm install` or `npm ci` without `--ignore-scripts`.

**Tests that need Chromium.** Layout, PDF text-extraction, image-export and error-boundary tests drive a real
Chromium through `playwright-core`. They look for Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` or at the path in the `CHROMIUM_PATH` environment variable,
and they are **skipped** (not failed) when it is missing, so a green run without Chromium covers less. At the
time of writing the suite is 30 files, 768 passed and 1 skipped; the skipped test regenerates thumbnails and is
skipped by design.

**CI.** `.github/workflows/ci.yml` runs the same checks on GitHub; see
[`docs/EAS_AND_SIGNING.md`](docs/EAS_AND_SIGNING.md#continuous-integration) for what it does and what has not been observed.

## Architecture

```
src/
  app/        Expo Router routes: thin re-exports of feature screens (and the root layout)
  features/   Screens and feature components: library, editor, templates, preview, tools, check,
              ats, coach, job-match, cover-letter, import, backup, settings
  domain/     Pure TypeScript, no React or Expo: resume model, template registry, HTML renderer,
              DOCX builder, parser, Score/ATS/Coach/Job Match/Cover Letter rules, i18n, backup format,
              storage ports (interfaces)
  services/   Everything with side effects: storage (SQLite, autosave, library), export (PDF/DOCX/PNG,
              share, rasterizer), backup (files, restore), preview, i18n (language, direction), tools
  i18n/       Message catalogs (en, de, fr, es, ar) and the translator
  ui/         Shared components, direction helpers, storage banner, error boundary, restart notice
locales/      Per-language app-name resources for Expo's `locales` (iOS/Android)
scripts/      pdfjs-source.mjs (postinstall)
docs/         Privacy draft, store readiness, EAS/signing and CI notes
```

The boundaries are enforced by tests (`src/__tests__/architecture.test.ts`): `domain/` imports no React, Expo
or services; only `services/storage` talks to SQLite; only the export and backup adapters touch the file
system and sharing; screens reach exports only through `ExportService`; and there are no network calls, AI
packages or billing packages in `src/`.

**Renderer.** One HTML renderer produces the in-app preview, the PDF (printed with `expo-print`) and the image
export (the same PDF, rasterized offline by a bundled pdf.js in a hidden WebView). The Word file is built
separately with the `docx` library from the same data and labels.

## Data and persistence

- **SQLite** (`my-resume.db`, via `expo-sqlite`), schema version 4, four ordered migrations in
  `src/services/storage/sqlite/schema.ts`. A database written by a newer app version is not opened and not
  modified (the app shows an error). Tables: `resumes`, `target_jobs` (the job description saved per resume),
  `local_profile` (a device-only profile; no screen creates it today), `app_settings` (the app language) and
  `export_records` (export history: template, type, outcome, short error text, time; no content or paths).
- **Autosave** is debounced and bounded (see above), ordered per resume, and flushed on screen blur and when
  the app leaves the foreground.
- **Error handling.** A failed save keeps the edit on screen and pending; a banner offers Retry, and nothing is
  retried automatically. A failed library load shows an error card, not an empty library. A failed delete
  returns the resume to the list. A root error boundary shows a recovery screen for render-time errors; it
  does not catch event-handler, promise or native crashes.
- **Export security.** An export is prepared once and represented by an opaque, frozen, single-use handle that
  expires after 5 minutes. It is only shared while the app is in the foreground, and its temporary files are
  deleted on failure and at the next launch.

## Export formats and paper size

| Format | How it is made |
|---|---|
| PDF | The shared HTML renderer, printed at the selected size. |
| Word (.docx) | Built with `docx`; the page size (`w:pgSz`) is written explicitly. |
| Image (PNG) | The PDF rasterized at 216 dpi (longest side capped at 2,400 px), one PNG per page, at most 10 pages, shared one share sheet per page. |

**Letter or A4** is chosen on the Preview screen and applies to PDF, Word and image export and to the preview
page. The starting choice comes from the country in the device locale tag (Letter for the US, Canada and a few
other countries, A4 elsewhere, Letter when no country is reported). It is a guess, not a promise, and it is
kept in memory only, so it resets when the app restarts.

## Backup and restore

- **Format.** `my-resume-backup`, version 1: UTF-8 JSON named `my-resume-backup-YYYY-MM-DD.json`. It contains
  every resume (content, language, template, accent color, title, timestamps), each resume's saved job
  description, the Local Profile if present, the app language and which resume is current. It does not contain
  export files or history, database internals, analysis results or any secret. The format and its
  compatibility rules are documented in `src/domain/backup/backup-format.ts`.
- **Export** writes the file to a private temporary folder and opens the system share sheet; the user chooses
  where it goes. Nothing is uploaded by the app.
- **Restore replaces everything.** The user picks a file; the app checks all of it (size, JSON, version, every
  field, template ids, languages, colors, duplicate ids) before touching anything, then asks for confirmation
  showing how many resumes are on the device and in the backup. Confirming replaces **all** current resumes
  with the backup's, in one database transaction that rolls back completely on any failure. Unsaved edits are
  saved first, and edits are blocked while it runs.
- **Limits.** Files over **20 MiB** are refused, as are backups with more than 500 resumes and files from a
  newer format version. Unknown extra fields in a version-1 file are ignored.
- **Backups are not encrypted.** They contain personal details in readable JSON. The user decides where the
  file is stored; once shared with another app or service, the app has no control over it.

## Known limitations and not implemented

Verified from the current repository:

- **Not validated on devices.** PDF output from `expo-print`, Word and Google Docs rendering of the `.docx`,
  image export memory use, the share sheet, the JSON file picker, keyboards, VoiceOver/TalkBack, Arabic
  right-to-left behavior at first launch and after a restart, and font fallback have not been tested on real
  iOS or Android devices.
- **No bundled fonts.** Documents use platform fonts; Arabic text depends on the device's Arabic font.
- **English-only analysis**: Score, ATS, Job Match, Cover Letter, Import (headings) and the Writing Coach.
- **Import** accepts pasted text only (no PDF or Word file import) and has no review step.
- **Image export** opens one share sheet per page (up to 10 pages).
- **iPad support is off** (iPhone-only build; no tablet layout exists). Android tablets are neither blocked nor
  validated.
- **The Android per-app language picker** is not offered.
- **Paper size** is not remembered across app restarts.
- **Removing a list entry** (a bullet, an experience) in the editor has no undo.
- **There is no in-app "delete all data"** and no way to clear the export history; uninstalling removes app data.
- **No cloud, sync, account, encryption or password protection.** Backup files are plain JSON.
- **Tailoring a resume to a job** and a cover-letter engine beyond the fill-in draft are not implemented.
- **Android `allowBackup` is enabled** in the generated manifest, so Android's own backup may include app
  data (see the privacy draft).

The full risk register is in `MOBILE_ONLY_ARCHITECTURE_PLAN.md` ("Current state") and
[`docs/PRIVACY_POLICY_DRAFT.md`](docs/PRIVACY_POLICY_DRAFT.md).

## Release preparation documents

| Document | Purpose |
|---|---|
| [`MOBILE_ONLY_ARCHITECTURE_PLAN.md`](MOBILE_ONLY_ARCHITECTURE_PLAN.md) | Architecture, decisions and per-phase records. Start at "Current state". Sections about subscriptions and premium are marked superseded. |
| [`docs/PRIVACY_POLICY_DRAFT.md`](docs/PRIVACY_POLICY_DRAFT.md) | **Draft** privacy policy from verified code behavior, with items needing human/legal review. |
| [`docs/STORE_READINESS.md`](docs/STORE_READINESS.md) | App Store and Google Play checklist; unknown values are TBD. |
| [`docs/EAS_AND_SIGNING.md`](docs/EAS_AND_SIGNING.md) | Current EAS configuration, signing and release steps, and CI. |
| [`MOBILE_PARITY_AUDIT.md`](MOBILE_PARITY_AUDIT.md) | Historical audit of an earlier prototype against the web product. Not current. |
| `AGENTS.md`, `CLAUDE.md` | Guidance for coding agents working in the repository. |

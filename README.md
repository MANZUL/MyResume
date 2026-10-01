# My Resume

Standalone iOS and Android resume builder (Expo). No AI, no backend: resumes stay on the device and
the app works offline.

**My Resume is completely free.** There is no subscription, purchase, paywall or account: every feature
(all 12 templates, preview, PDF/Word/image export, Resume Score, Writing Coach, ATS Readability, Job Match,
Cover Letter, import, custom colors, English and German) is available to everyone. The app has a real SQLite
data layer, a secure export service (PDF, Word, PNG images) and deterministic analysis tools; see
[`MOBILE_ONLY_ARCHITECTURE_PLAN.md`](MOBILE_ONLY_ARCHITECTURE_PLAN.md) (§19.12 records the move to a free product).

## Layout

```
src/
  app/        Expo Router routes (thin: each re-exports a feature screen)
  features/   screens and feature components (library, import, editor, preview, tools, check,
              job-match, cover-letter, settings)
  domain/     pure TypeScript business logic: resume model, templates, renderer, DOCX builder,
              parser, job match, cover letter, resume score, ATS, Writing Coach, i18n
  services/   side effects: storage (on-device SQLite repositories + migrations), export
              (PDF/DOCX/PNG + share), preview, tools, i18n
  ui/         shared UI components
```

## Run

```bash
npm install
npm test            # unit + architecture guard tests (no AI, no network, mobile-only deps);
                    # layout tests run in Chromium when it is installed (CHROMIUM_PATH), else skip
npm run typecheck
npm run lint
npx expo run:ios    # or: npx expo run:android (development build)
```

## Free product

My Resume has no monetization: no billing SDK, no purchase or entitlement code, no paywall and no prices.
A guard test (`src/__tests__/free-product.test.ts`) fails if any of that architecture comes back.

# My Resume

Standalone iOS and Android resume builder (Expo). No AI, no backend: resumes stay on the device and
the app works offline.

**Status: migration in progress.** The app is still the prototype, restructured with a real SQLite data layer, entitlement
architecture, secure export (PDF, Word, PNG images) and a watermarked FREE preview (steps 1–6 of
[`MOBILE_ONLY_ARCHITECTURE_PLAN.md`](MOBILE_ONLY_ARCHITECTURE_PLAN.md)). The product specification,
pricing (free to build, $7.99/month "premium" to export) and the remaining steps are in that plan.

## Layout

```
src/
  app/        Expo Router routes (thin: each re-exports a feature screen)
  features/   screens and feature components (library, import, editor, preview, tools, check,
              job-match, cover-letter, paywall)
  domain/     pure TypeScript business logic: resume model, templates, renderer, DOCX builder,
              parser, job match, cover letter, resume score, access policy
  services/   side effects: storage (on-device SQLite repositories + migrations), export
              (PDF/DOCX + share), entitlement
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

## Billing

Real Apple/Google billing is not implemented yet and no billing SDK is installed. The app depends only
on `EntitlementService` (one entitlement, `premium`, $7.99/month):

- **Development builds** use a simulated store (`services/entitlement/fake-store.ts`), so premium
  flows can be tried end to end. It is excluded from release bundles.
- **Release builds** have no store yet, so every user is FREE: build, edit, preview (watermarked),
  Resume Score and Cover Letter work; export and the premium tools show the paywall.

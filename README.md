# My Resume

Standalone iOS and Android resume builder (Expo). No AI, no backend: resumes stay on the device and
the app works offline.

**Status: migration in progress.** The app is still the prototype, restructured with a real SQLite data layer (steps 1–2 of
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
npm test            # unit + architecture guard tests (no AI, no network, mobile-only deps)
npm run typecheck
npm run lint
npx expo run:ios    # or: npx expo run:android (development build)
```

## Billing

Not implemented yet. The app has no billing SDK. `services/entitlement` is a vendor-neutral
placeholder: debug builds allow export, and release builds keep export locked (fail closed) until
Apple App Store and Google Play subscriptions are added in a later, separately approved step.

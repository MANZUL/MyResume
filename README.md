# MyResume — iOS & Android (Expo)

Native mobile build of the [MyResume web app](https://github.com/MANZUL/Resume). It needs **no AI and
no server**. Everything runs on the device and works offline.

| Feature | Web app | This app |
|---|---|---|
| Edit resume sections | ✓ | ✓ |
| 12 ATS templates + accent colors | ✓ | ✓ (same template configs) |
| Import an existing resume | Claude (AI) parses upload | Rule-based parser for pasted text, on-device |
| Resume check / score | rule-based | same rules (`src/lib/resume-score.ts`) |
| Job match | Claude (AI) | Keyword comparison, on-device |
| Cover letter | Claude (AI) | Template filled from your resume |
| PDF / Word export | browser print + `docx` | `expo-print` + `docx`, shared through the share sheet |
| Payment | Dodo web checkout | App Store / Google Play in-app purchase (via RevenueCat) |
| Storage | browser + optional server drafts | on-device (AsyncStorage) |

A test (`src/__tests__/tools.test.ts`) fails if any AI SDK, `fetch(`, or remote API call gets into `src/`.

## Run

```bash
cd MyResume
npm install
npm test            # unit tests: parser, job match, renderer, DOCX, payment gate, no-AI guard
npm run typecheck
npm run lint
npx expo start      # then press i / a. Needs a development build (see below), not Expo Go
```

`react-native-purchases` includes native code, so use a development build:
`npx eas-cli@latest build --profile development --platform ios|android`, or run `npx expo run:ios|android` locally.

## Build for the stores (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                       # links the project and writes the projectId
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform all
```

`preview` builds an installable Android APK and an internal iOS build for testers.
Change `bundleIdentifier` / `package` (`com.myresume.app`) in `app.json` to your own before the first build.

## Payments (export unlock)

Editing, preview, the resume check, job match and cover letters are free. PDF and Word export need a
one-time purchase.

1. Create a non-consumable product in App Store Connect and Google Play Console.
2. In RevenueCat, attach both products to an entitlement named **`exports`** and add them to the current offering.
3. Set the public SDK keys as EAS environment variables (or in `.env` for local builds):
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.

How purchases are checked (`src/lib/access.ts`, `src/lib/purchases.tsx`, `src/lib/export.ts`):

- Exports unlock only when RevenueCat reports an active `exports` entitlement. RevenueCat validates the
  store receipt on its servers. The app keeps no "isPro" flag in storage that a user could edit.
- Trusted Entitlements is on. A response whose signature fails verification never unlocks.
- A release build with no keys stays locked (fail closed). Only `__DEV__` builds unlock without keys,
  so you can test before the stores are set up, and the preview screen shows a notice when this happens.
- Both export functions check access themselves, so no screen can produce a file without it.
- Until exports are unlocked, the on-screen preview carries a "PREVIEW" watermark. The WebView has
  JavaScript, text selection and navigation turned off.

Residual risk: a user who modifies the app binary on a jailbroken or rooted device can get around any
check that runs on the device. Closing that gap would need server-side export rendering, and the
no-server requirement rules that out.

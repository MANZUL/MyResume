# EAS configuration, signing and release checklist

This document records what `app.json` and `eas.json` contain **today** (commit `e55dd2c`) and the steps that
are still needed before a release. **Nothing here has been executed:** no EAS build, no credential
creation, no store submission and no device run happened in phase 19. No credentials or secrets are
stored in this repository and none should ever be added to it. Unknown values are **TBD**.

## What is configured

### `app.json` (Expo config)

| Setting | Value |
|---|---|
| Name / slug / scheme | `My Resume` / `my-resume` / `myresume` |
| Version | `1.0.0` (user-visible version; build numbers are not set here, see below) |
| Owner / EAS project id | `snln` / `b6228382-fccd-4ffb-a501-0d1da73af85f` (`extra.eas.projectId`) |
| iOS bundle identifier | `com.manzul.myresume` |
| Android package | `com.manzul.myresume` |
| iPad | `ios.supportsTablet: false` (iPhone-only build; no tablet layout exists) |
| iOS localizations | `CFBundleLocalizations`: en, de, fr, es, ar; plus Expo `locales` files in `locales/` |
| iOS export compliance | `ITSAppUsesNonExemptEncryption: false` (**REVIEW**: a human must confirm this answer) |
| Android blocked permission | `android.permission.RECORD_AUDIO` |
| Orientation / UI style | portrait / light |
| Assets | `assets/icon.png`, Android adaptive icon layers (foreground, background, monochrome) and `assets/splash-icon.png`, all 1024 × 1024 PNGs |
| Plugins | `expo-router`, `expo-sharing`, `expo-splash-screen`, `expo-sqlite` |

The project link (`owner` and `projectId`) is only **present** in the file. It was not checked against the
EAS service, because that needs a logged-in account.

### `eas.json`

| Profile | Settings | Notes |
|---|---|---|
| `cli` | `version: ">= 16.0.0"`, `appVersionSource: "remote"` | Build numbers are managed by EAS (remote), not in the repository. |
| `build.development` | `developmentClient: true`, `distribution: "internal"` | For development builds with the dev client. |
| `build.preview` | `distribution: "internal"`, Android `buildType: "apk"` | An installable Android APK for internal testing. |
| `build.production` | `autoIncrement: true` | No other settings: Android uses EAS's default artifact type for production (**confirm in the EAS documentation at release time**). |
| `submit.production` | `{}` | Empty: no App Store Connect app id and no Google service account are configured. |

Not configured (and not needed to be invented now): `channel`/OTA updates (`expo-updates` is not installed, so
there are no over-the-air updates), environment variables, an iOS simulator profile.

### Local build numbers (from a scratch `expo prebuild`, not committed)

The generated native projects (`/ios`, `/android` are git-ignored; the project uses Continuous Native
Generation) show `CFBundleVersion 1` and `versionCode 1`. With `appVersionSource: "remote"` and
`autoIncrement: true`, EAS is expected to supply increasing build numbers for production builds.

## Versioning strategy (proposed, not yet decided: REVIEW)

- `version` in `app.json` is the user-visible semantic version (`1.0.0` today). Change it by hand for each release.
- Build numbers (`CFBundleVersion`, `versionCode`) are remote and auto-incremented by EAS for the `production` profile.
- Keep the `version` in `app.json`, the store listing and the release notes in step.

## Required future steps: iOS

Everything below needs a human with the right accounts. TBD means the value is unknown to this repository.

1. **Apple Developer Program membership** for the publishing entity: TBD (entity and account holder unknown).
2. **App Store Connect app record** for bundle id `com.manzul.myresume` (name availability TBD).
3. **Signing.** Either let EAS manage credentials (`eas credentials` / the first `eas build --platform ios`
   prompts for Apple login) or provide your own distribution certificate and provisioning profile. Credentials
   live in EAS or in your keychain, **never in this repository** (`.gitignore` already excludes `*.p12`,
   `*.p8`, `*.key`, `*.mobileprovision`, `*.jks` and `*.pem`).
4. **Build:** `eas build --platform ios --profile production` (**not run**).
5. **Submit:** configure `submit.production.ios` (`ascAppId` and the authentication method) or upload with
   Transporter; then TestFlight internal testing before review. TBD.
6. **Privacy:** App Privacy ("nutrition label") answers, and whether an app-level privacy manifest
   (`PrivacyInfo.xcprivacy`) is needed: the generated project currently has **no app-level privacy
   manifest** (**REVIEW**, see `docs/STORE_READINESS.md`).
7. **Export compliance:** confirm `ITSAppUsesNonExemptEncryption: false`.

## Required future steps: Android

1. **Google Play Console developer account** and an app entry for package `com.manzul.myresume`: TBD.
2. **App signing.** Prefer Play App Signing. Let EAS generate and hold the upload keystore (`eas credentials`)
   and **download and store a backup of it outside the repository**; losing the upload key complicates
   updates. Never commit a `.jks`.
3. **Build:** `eas build --platform android --profile production` (**not run**). Confirm the artifact type
   (an Android App Bundle is what Play expects for new apps).
4. **Internal testing:** `eas build --profile preview` produces an APK for sideloading; it was **not built**.
5. **Submit:** create a Google service account with Play Console access for `eas submit`, configure
   `submit.production.android`, and keep the key file out of git. TBD.
6. **Permissions review.** The generated manifest (from `app.json`) includes `INTERNET`, `READ_EXTERNAL_STORAGE`
   and `WRITE_EXTERNAL_STORAGE` (both limited to Android 12L and lower), `SYSTEM_ALERT_WINDOW` and `VIBRATE`;
   `RECORD_AUDIO` is removed. Whether each is needed in a **release** build (several come from the
   development client) must be reviewed before the Data safety form is filled in. **REVIEW**
7. **`android:allowBackup="true"`** is set in the generated manifest. Decide whether to keep it (see the
   privacy draft). **REVIEW**

## Things to decide before the first release build (REVIEW)

- `expo-dev-client` is a production dependency. Decide whether production builds should include it (it
  contributes the iOS ATS and local-network entries and Android overlay/vibrate permissions noted above).
- Whether to bundle an Arabic-capable font (documents currently use platform fonts).
- The `npm audit --omit=dev` advisories (below).

### `npm audit --omit=dev` at this commit

`braces` (high) and `node-forge` (high) via `@expo/cli`; `shell-quote` (critical) via
`react-native` → `react-devtools-core`; `decode-uri-component` (moderate) via `expo-router` →
`query-string`. These are transitive dependencies of the Expo and React Native toolchain. This phase did not
analyze whether any of them is exploitable in the app or ships in a release bundle (`decode-uri-component` is
reached through a runtime dependency, `expo-router`). `npm audit fix` suggests changes that are not usable
(it proposes a downgrade). Track the Expo SDK patch releases and re-check before release. TBD.

## Release procedure outline (all steps TBD until a human runs them)

1. Complete the remaining implementation fixes and the final source review (planned Phase 20).
2. Run device validation (planned Phase 21, last): the checklist is in `MOBILE_ONLY_ARCHITECTURE_PLAN.md`
   (sections 19.11b and the per-phase "Device validation" notes).
3. Finalize the privacy policy and store forms (`docs/PRIVACY_POLICY_DRAFT.md`, `docs/STORE_READINESS.md`).
4. Build with EAS (`production`), test the produced binaries on devices.
5. Submit for store review; respond to review feedback.

## Continuous integration

`.github/workflows/ci.yml` (added in phase 19) defines two jobs. **It has not been observed running on GitHub;**
it was written from commands that were run locally and parsed as valid YAML.

| Job | What it runs |
|---|---|
| `verify` | Node 22 and `npm ci` (which runs the required `postinstall`); installs Liberation and DejaVu fonts and Playwright's Chromium (revision 1194, the one `playwright-core` 1.56.1 expects) and fails if Chromium is missing, so the Chromium-based tests are not silently skipped; then `npm run typecheck`, `npm run lint`, the localization, free-product, architecture and config guard test files by name, and the whole suite with `npm test`. |
| `bundles` | For `ios` and `android`: `npx expo export --platform <platform> --output-dir dist --clear`. |

Notes and limits:

- It uses no secrets, no credentials, no EAS and no store access, and has read-only repository permissions.
  Actions are pinned to major tags (`actions/checkout@v4`, `actions/setup-node@v4`), not commit SHAs.
- The Chromium tests may behave differently on a GitHub runner than in the environment used so far
  (fonts and rendering). If they fail only in CI, investigate the fonts before changing the tests.
- **A green CI run does not prove the app works on a device.** Bundle exports prove only that the JavaScript
  compiles and bundles. There is no native build, no emulator and no device test in CI.

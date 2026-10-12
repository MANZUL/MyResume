# Release configuration review (phase 20)

Base: `2640844`. Method: `app.json`, `eas.json`, `package.json` and the lockfile were read; a **scratch**
`expo prebuild` (outside the repository, `/ios` and `/android` are git-ignored and untracked) produced the
native config that was inspected; library manifests and plugin sources in `node_modules` were read;
`npm audit` was run; the GitHub run history was read through the GitHub API. **Nothing was built
(no Gradle, Xcode or EAS), nothing ran on a device or emulator, nothing was submitted.** Every statement
about runtime behavior below is therefore "from configuration and source", not "observed".

## Decisions

| # | Topic | Evidence | Impact | Action | Regression risk |
|---|---|---|---|---|---|
| 1 | `expo-dev-client` | `expo-dev-launcher` and `expo-dev-menu` declare `"debugOnly": true` for Apple in their `expo-module-config.json` (autolinking links them only into Debug). The scratch prebuild adds a build phase "[Expo Dev Launcher] Strip Local Network Keys for Release" which, for non-Debug configurations, deletes the dev launcher's `NSBonjourServices` entry and its `NSLocalNetworkUsageDescription` text from the built Info.plist. On Android the dev-launcher Gradle plugin instruments OkHttp only for debuggable variants; the Android module is **not** declared debug-only in its config, so whether dev-launcher classes are packaged in a release APK/AAB is **not verified** (no Gradle build was allowed). `eas.json` `development` profile has `developmentClient: true`, which needs the package. `expo-dev-client` is not in `app.json` `plugins`; its config plugin runs through autolinking. | The package is a normal dependency but is built as development-only on iOS by design. Its Android release footprint is unverified. | **Keep the dependency.** Moving it to `devDependencies` is not safe to assert: EAS installs dev dependencies for builds, and a mistaken move would break the `development` profile. Recorded as an open Phase 21 / first-build check: inspect the release artifact. | None (no change). |
| 2 | Android OS backup (`allowBackup`) | Default (`true`, no rules) in the prebuild. `expo-sqlite` keeps databases in `context.filesDir/SQLite` (read in `SQLiteModule.kt`), which Android Auto Backup includes by default; the cache directory (temp exports and backup files) is excluded by Android. Resume content and the Local Profile are sensitive and the app already has an explicit, user-controlled JSON backup. | With `true`, resume data may be copied to the user's Google account backup and to a new device during setup, outside the app's own backup screen and not described in the app. | **Set `android.allowBackup` to `false`** (an Expo-supported key in the installed config types; the prebuild shows `android:allowBackup="false"`). No custom XML or plugin, so there is no new code. | Consequence, accepted: the OS will no longer restore app data on reinstall or a new phone. Recovery is only through the user's JSON backup (Backup screen). Not device-tested; the platform's exact behavior with the flag is from documentation, not from a device. Revertible with one line. |
| 3 | iOS backup | `expo-sqlite` stores databases under the app's Documents/SQLite area by default, which iOS includes in iCloud and computer backups. Excluding a file needs native code (`isExcludedFromBackup`) or a custom plugin; no config switch exists. | Resume data may be in the user's device backups. | **No change; unresolved and documented** (privacy draft section 6, store readiness). | None. |
| 4 | Android permissions | Prebuild manifest at the base: `INTERNET`, `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (maxSdk 32), `SYSTEM_ALERT_WINDOW`, `VIBRATE` (`RECORD_AUDIO` already removed). `READ/WRITE_EXTERNAL_STORAGE` and `INTERNET` come from `expo-file-system`'s library manifest. The app reads files only through the system document picker (`ACTION_OPEN_DOCUMENT`) and shares through `FileProvider` content URIs; it writes only to the app cache. `SYSTEM_ALERT_WINDOW` is also declared by React Native's own debug manifest and by the app's `src/debug` manifest in the template. `src` uses no vibration, haptics, media-library or runtime-permission API. | Unneeded permissions widen the store disclosures. | **Block** `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW` via `blockedPermissions` (the prebuild shows `tools:node="remove"` for all three). **Keep `INTERNET`:** the debug template manifest does not declare it, so blocking it would very likely stop development and Metro connections, and no device was available to confirm release behavior of WebView printing without it. **Keep `VIBRATE`:** unused by `src`, normal-level, harmless; not worth an untested block. | The manifest merge happens in Gradle, which was not run, so the merged result is **not verified**. Risk: file picker or share failing on Android 12L and lower (documented APIs do not need these permissions). Phase 21 must test picker, share and backup/restore on an Android 12 or lower device, if one is available. |
| 5 | Updates and runtime versions | `expo-updates` is not installed; the prebuilt manifest has `expo.modules.updates.ENABLED=false`; no `updates` or `runtimeVersion` key in `app.json`; `eas.json` has no `channel`. | No OTA path exists. | **No change.** Guarded by a new test. | None. |
| 6 | Versions | `app.json` `version: "1.0.0"`; `eas.json` `appVersionSource: "remote"`, production `autoIncrement: true`; local prebuild shows build number 1. | n/a | **No change**; policy below. | None. |
| 7 | `npm audit` | See the advisory table. | Mostly build tooling. | **Lockfile-only, in-range update** of `shell-quote` 1.10.0 → 1.12.0 and `source-map-js` 1.2.1 → 1.2.2 (both satisfy the existing semver ranges; no `package.json` change). | Low: both are transitive tooling dependencies; `npm ci`, tests, typecheck, lint and both bundle exports were re-run. |
| 8 | CI | A real run exists for `2640844`. | n/a | **No workflow change needed.** See the CI section. | n/a |

## Versioning policy (documented, not yet decided by the owner)

- `app.json` `version` is the user-visible version, edited by hand for each release (semantic: `MAJOR.MINOR.PATCH`). It is `1.0.0` today. No release version was invented or changed.
- iOS `CFBundleVersion` and Android `versionCode` are managed remotely by EAS (`appVersionSource: remote`) and auto-incremented for the `production` profile. The repository holds no build numbers.
- The same `version` is used for iOS and Android. The `preview` and `development` profiles do not auto-increment.
- There are no OTA updates, so every change to JavaScript needs a new store build and a new build number.

## `npm audit` classification

`npm audit` (all) at the base: 33 advisories (12 moderate, 20 high, 1 critical). `--omit=dev` reports the same 33, because Expo's CLI and config packages are listed as production dependencies of `expo`. After the lockfile update: **31** (12 moderate, **19 high, 0 critical**).

| Advisory (package) | Severity | Path | Class | Status |
|---|---|---|---|---|
| `shell-quote` command injection in `quote()` | critical | `react-native` → `react-devtools-core` | Development tooling (React Native DevTools; not application code) | **Fixed** (lock, 1.12.0) |
| `source-map-js` event-loop DoS via source-map offsets | high | `expo` → `@expo/metro-config` → `postcss` | Build chain (Metro CSS pipeline) | **Fixed** (lock, 1.2.2) |
| `node-forge` RSA PKCS#1 signature verification | high | `expo` → `@expo/cli` → `@expo/code-signing-certificates` | Build/CLI (code-signing for Expo Updates, which this app does not use) | Open: the only offered fix is `expo@44` (a downgrade, breaking) |
| `braces` / `micromatch` stack exhaustion | high | `expo` → `@expo/cli`, `@expo/metro-file-map`, `metro-file-map` | Build chain (file globbing in Metro) | Open: forced fix is a downgrade |
| `metro`, `metro-config`, `@expo/metro*`, `@react-native/*`, `react-native`, `react-native-worklets`, `react-native-reanimated` (aggregated "via" entries) | high | via the packages above | Build chain; the entries are rollups of the advisories above (the offered "fixes" are `react-native@0.72`, `expo@44`: downgrades) | Open |
| `xcode` / `uuid` (missing buffer bounds check in v3/v5/v6 with a caller-supplied buffer) | moderate | `@expo/config-plugins` → `xcode` → `uuid`; `expo-sharing`, `expo-splash-screen`, `@expo/prebuild-config` | Build chain (native project generation) | Open: forced fix is a major downgrade of `expo-splash-screen` |
| `decode-uri-component` DoS via malformed percent-encoding | moderate | `expo-router` → `query-string` | **Runtime dependency** (shipped in the JS bundle). Reachable only if the app passes untrusted percent-encoded query text through `query-string`; the app has no web URLs and routes are fixed, but this was **not proven** by test | Open: the offered fix is `expo-router@58`, a different SDK line (breaking) |

Not applied (per the brief): `npm audit fix --force`, major upgrades, `overrides`. The remaining advisories cannot be cleared without an Expo SDK change; revisit on the next SDK patch.

## CI (GitHub Actions)

- Remote: `https://github.com/MANZUL/myresume` (the API reports the canonical name `MANZUL/MyResume`).
- Workflow: `.github/workflows/ci.yml`; triggers `push`, `pull_request`, `workflow_dispatch`; `permissions: contents: read`; no secrets; commands are the repository's own (`npm ci`, `npm run typecheck`, `npm run lint`, `npx vitest run …`, `npm test`, `npx expo export …`).
- **Observed:** run #1, id `38245010810`, event `push`, branch `claude/expo-ios-android-build-i9f7t9`, commit `2640844`, conclusion **success**: https://github.com/MANZUL/MyResume/actions/runs/38245010810 . Jobs: "Typecheck, lint, tests" (success; log: 768 passed, 1 skipped, same as local), "Bundle export (android)" and "Bundle export (ios)" (success). The Chromium check step passed, so the Chromium-based tests were not skipped for a missing browser.
- Notes: GitHub warned that Node 20 actions are forced onto Node 24 (`actions/checkout@v4`, `actions/setup-node@v4`); a "failed to save cache" notice is harmless (parallel jobs share one cache key). Neither was changed.
- Whether the run for the phase 20 commit passes is checked after the push (see the phase report).

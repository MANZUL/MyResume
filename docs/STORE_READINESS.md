# Store readiness checklist (App Store and Google Play)

Status of each item at commit `e55dd2c`. **Nothing here was submitted, and no store policy was checked or
approved.** "Ready in repo" means a file or setting exists; it does not mean a store accepts it. Unknown values
are **TBD** and are not invented. Items marked **REVIEW** need a human or legal decision.

Legend: ✅ ready in the repository · ⚠️ partly ready or needs a decision · ⬜ TBD (not started or unknown)

## Product facts the listings must match (verified in the repository)

- Free, with no in-app purchases, subscriptions or ads; no account or login; works offline; no AI.
- Languages: English, German, French, Spanish, Arabic (UI). Resume documents in the same five languages.
- iPhone only (iPad support off). Android: phones and tablets are not restricted or validated.
- Files leave the device only when the user exports or shares them. A backup file is **not encrypted**.

## Shared items

| Item | Status | Notes |
|---|---|---|
| App name "My Resume" | ⚠️ | Name availability in both stores: TBD. |
| Short description, full description, promotional text, keywords | ⬜ | Must not claim ATS success, AI features, cloud sync, encryption or device-tested behavior. TBD. |
| Store listing languages | ⬜ | The app has five languages; which listings to localize: TBD. |
| Category / content rating questionnaires | ⬜ | TBD (human answers). |
| Privacy policy URL | ⬜ | A hosted page is required by both stores: **TBD**. Draft text: `docs/PRIVACY_POLICY_DRAFT.md` (REVIEW). |
| Support URL and contact e-mail | ⬜ | TBD. |
| Marketing URL | ⬜ | Optional. TBD. |
| Legal entity / developer name, copyright line | ⬜ | TBD. |
| Release notes (first version) | ⬜ | TBD. |
| Terms of use | ⬜ | Not required by the code; whether needed: REVIEW. |
| App icon | ✅ | `assets/icon.png` 1024 × 1024; Android adaptive icon layers present. Store art review: TBD. |
| Splash screen | ✅ | `assets/splash-icon.png`. |
| Screenshots | ⬜ | None exist. They must come from real devices after validation (Phase 21); sizes required by each store at submission time: TBD. Show real, unmodified app screens. |
| Account deletion requirement | ⚠️ | The app has no accounts. Confirm the store requirement does not apply: REVIEW. |
| Final device QA | ⬜ | **Not done.** Phase 21; see the device checklists in `MOBILE_ONLY_ARCHITECTURE_PLAN.md`. |

## Apple App Store

| Item | Status | Notes |
|---|---|---|
| Apple Developer Program membership | ⬜ | TBD. |
| App record for `com.manzul.myresume` | ⬜ | TBD. |
| Signing (distribution certificate, provisioning profile) | ⬜ | Via EAS or manual; see `docs/EAS_AND_SIGNING.md`. No credentials in the repository. |
| Pricing | ⚠️ | Free (the code has no purchases). Set in App Store Connect: TBD. |
| App Privacy ("nutrition label") | ⬜ | The code collects no data on a server, but the answers depend on the REVIEW items in the privacy draft (release-build network behavior, device backups). **Do not answer "no data collected" until reviewed.** |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | ⚠️ | No app-level manifest is generated or configured at this commit. Whether one is required for the libraries and APIs used: REVIEW. |
| Export compliance | ⚠️ | `ITSAppUsesNonExemptEncryption: false` is set. A human must confirm the answer. |
| Age rating | ⬜ | TBD. |
| Review notes | ⬜ | Suggested content (to be confirmed): no login needed; all features are available at launch; the app is offline; test by creating a resume from a template and exporting a PDF. |
| TestFlight testing | ⬜ | TBD. |
| iPad screenshots | n/a | iPad support is off (`supportsTablet: false`). |

## Google Play

| Item | Status | Notes |
|---|---|---|
| Play Console developer account, app entry for `com.manzul.myresume` | ⬜ | TBD. |
| App signing (Play App Signing, upload key) | ⬜ | EAS can manage the upload keystore; back it up outside the repository. See `docs/EAS_AND_SIGNING.md`. |
| Release artifact | ⬜ | Production build with EAS; confirm an app bundle. **Not built.** |
| Data safety form | ⬜ | Depends on the privacy REVIEW items (permissions in the generated manifest, `allowBackup`, release-build network behavior). **Do not declare "no data collected or shared" until reviewed.** |
| Permissions declarations | ⚠️ | Review `INTERNET`, storage (≤ Android 12L), `SYSTEM_ALERT_WINDOW`, `VIBRATE` in a release build. |
| Content rating (IARC) questionnaire | ⬜ | TBD. |
| Target audience and content / ads declaration | ⬜ | The app has no ads. Target audience: TBD (REVIEW). |
| Testing track (internal / closed) | ⬜ | Requirements for new personal accounts (testers, duration) must be checked in Play Console at the time: TBD. |
| Phone and tablet screenshots, feature graphic | ⬜ | TBD. |

## Before any submission

1. Phase 20 fixes done (see the plan's "Current state" section).
2. Device validation (Phase 21) done and the findings fixed.
3. Privacy policy reviewed and published at a real URL; store privacy forms answered from the reviewed policy.
4. Production builds made with EAS and tested from the store's own test channels.

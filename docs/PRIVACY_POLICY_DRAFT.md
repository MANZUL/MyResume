# My Resume: privacy policy (DRAFT)

> **DRAFT. NOT FOR PUBLICATION AS IS.** This text was written from what the source code of this repository
> does at commit `e55dd2c` (plus a one-off `expo prebuild` of the current `app.json` in a scratch folder to read
> the generated native configuration). It is **not legal advice**, makes **no claim of compliance** with any
> law or any App Store or Google Play policy, and has **not** been reviewed by a lawyer. Everything marked
> **REVIEW** needs a human or legal decision before a policy is published. Contact details, the legal entity,
> jurisdiction and hosting are **TBD** and are intentionally not invented here.
>
> Nothing in this repository has been run on a real device, so statements about what the operating system or
> a native library does at run time are marked as unconfirmed.

**Publisher / data controller:** TBD (REVIEW)  
**Contact for privacy questions:** TBD (REVIEW)  
**Effective date:** TBD

## 1. Summary (verified from the code)

My Resume is a resume builder that works on your device. The app has no server, no account or login, no
advertising, no analytics and no AI processing. Your resumes are stored on your device. The app only sends
data somewhere when you ask it to (for example by exporting or sharing a file), and where it goes then is
chosen by you.

## 2. What is stored on your device

All of the following is stored in a local SQLite database inside the app's private storage:

| Data | Details |
|---|---|
| Resume content | Everything you type or import: name, contact details (phone, e-mail, location, LinkedIn and website addresses), summary, skills, work experience, education, certifications, projects, awards. |
| Resume settings | Each resume's title, template, accent color, language, creation and change times. |
| Job descriptions | The job description text you paste into Job Match is saved with that resume. |
| Local Profile | The app has storage for a device-only profile (name, contact details, headline). **No screen in the current app creates one**, so it is normally empty. It is included in a backup if it exists. |
| App settings | The app language you chose. |
| Export history | One row per export attempt: resume reference, template, file type (PDF, Word, image), succeeded or failed, a short technical error text for failures, and a time. It contains no resume content and no file path. |

The app reads the device's language setting (through the platform's locale information) to choose a starting
app language and a starting paper size (Letter or A4). This value is used on the device and is not sent
anywhere by the app.

**Not stored or not collected (verified from the code):** no account, password or token; no advertising or
device identifier; no location from sensors; no contacts, photos, camera or microphone data; no usage
analytics or crash-reporting SDK is included (see the dependency list in `package.json`).

## 3. Network use

The source code under `src/` contains no network requests (an automated test fails if `fetch`, XMLHttpRequest,
WebSocket, remote URLs or AI/billing packages appear). The two in-app web views (the resume preview and the
hidden page that turns a PDF into images) load only local content: the preview has JavaScript disabled and
blocks navigation; the image page has a Content Security Policy that forbids network access.

**REVIEW:** The Android manifest generated for this project declares the `INTERNET` permission (it is part of
the standard Expo/React Native template and is needed by development tools). The app's own code does not use
it. Whether the libraries bundled into a **release** build make any network request cannot be confirmed
from this repository and has not been tested on a device. The project also lists `expo-dev-client` as a
dependency; the generated iOS configuration contains development-launcher entries (a permissive App Transport
Security setting and a local-network usage description). Whether those remain in release builds must be
checked, and the policy must not be published until that is understood.

## 4. Sharing, exports and backups (your choice)

- **Exports (PDF, Word, image).** A file is created in the app's temporary storage and handed to the
  operating system's share sheet. **You** choose the destination (another app, Files, e-mail, messaging, cloud
  storage and so on). The app does not know what you do with the file. Once it is in another app or service,
  that app or service's own privacy terms apply, not this policy. Temporary export files are deleted when an
  export fails and at the next time the app starts; a file you saved elsewhere is not touched by the app.
- **Cover letter.** The text can be copied to the clipboard or shared with the system share sheet when you press
  the buttons.
- **Backup.** "Export backup" creates one JSON file containing all your resumes (including contact details,
  job descriptions, the Local Profile if present, and the app language) and opens the share sheet. **The
  backup file is not encrypted.** Anyone who can open the file can read it. Keep it somewhere private. The app
  does not upload it, and cannot protect it after you share it.
- **Restore.** Restoring reads a file you choose and **replaces all resumes on the device** after you confirm.

## 5. Deleting data

- **Delete a resume** (Home, long press, Delete): removes the resume and its saved job description from the
  database. The export-history rows that mention it stay, with the link to the resume removed.
- **Restore a backup** replaces all resumes (and the Local Profile) with the backup's.
- **Uninstalling the app** removes the app's local database and temporary files from the device.
- **Limits (REVIEW):** the app has no "delete all my data" button and no way to clear the export history.
  Files you exported or backed up are outside the app; delete them yourself where you saved them. Deleted
  data may remain in your device's or cloud account's own backups (see the next section).
- A leftover database file from older development builds (`my-resume-entitlement.db`) may exist on devices
  that ran such builds; the current app does not open or read it.

## 6. Operating-system backups (REVIEW)

- **Android:** the generated manifest sets `android:allowBackup="true"`. On Android this normally lets the
  system include the app's data (including the resume database) in Android's backup and device-transfer
  features when the user has them turned on. Whether the project should opt out, and what to say, is an
  open decision. This has not been tested.
- **iOS:** app data is typically included in iCloud and computer backups of the device by default. Not tested.
  Temporary export and backup files are kept in the cache folder.

## 7. Children (REVIEW)

The app collects no personal data on any server and has no age gate. Whether it is directed at, or appeals
to, children, and what that means for store declarations, is a human decision. Not addressed here.

## 8. Your rights, retention, legal basis, international transfers (REVIEW)

Not drafted. Because the publisher does not receive resume data, many typical policy sections may be
shorter, but which statements are accurate and required depends on the publisher, the jurisdictions and the
store rules, and must be decided by a qualified person. TBD.

## 9. Changes to this policy

TBD (REVIEW).

---

## Verification table (for the reviewer)

| Statement | Evidence in the repository |
|---|---|
| No account, login or backend | No such code under `src/`; `README.md`; plan §19.12 |
| No network requests in app code | `src/__tests__/architecture.test.ts` ("core features work without a network") |
| No AI, no billing | Same file; `src/__tests__/free-product.test.ts` |
| No analytics, ads or crash SDK | `package.json` dependencies (Expo modules, React Native, `docx`, `pdfjs-dist`, WebView) |
| Data kept in local SQLite | `src/services/storage/sqlite/schema.ts` |
| Preview and image page are offline | `PreviewScreen.tsx` (JS off, navigation blocked); `rasterizer-page.ts` CSP; `RasterizerHost.tsx` |
| Export temp files removed on failure and at launch | `export-service.ts`, `file-export-platform.ts`, `_layout.tsx` (`purgeExportArtifacts`) |
| Backup content and no encryption | `src/domain/backup/backup-format.ts` header; screen text |
| Delete behavior | `resume-library.ts` (`remove`), `schema.ts` (`target_jobs`, `export_records`) |
| Android `allowBackup="true"`, `INTERNET` permission, no app-level iOS privacy manifest | Generated by `expo prebuild` from the current `app.json` in a scratch folder at this commit (not committed: `/ios` and `/android` are git-ignored) |

| Not verifiable here | Why |
|---|---|
| Behavior of native libraries in release builds on real devices | No device or release build was run |
| Store privacy declarations ("data not collected" and similar) | Depend on the REVIEW items above and on store rules |
| Anything about the publisher, contact, jurisdiction | Not in the repository |

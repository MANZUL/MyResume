# My Resume — mobile-only architecture plan

**Status: plan only.** Nothing is implemented yet: no billing SDK, no AI, no EAS builds.

**Revision 3: "Free to build, paid to export."**
- FREE users can build, edit, save and preview resumes.
- PREMIUM ($7.99/month, entitlement `premium`) is needed to take the resume *out* of the app (PDF, DOCX, image, share, clean output), and for the premium tools.
- Revision 2's FREE/PREMIUM split is withdrawn.

**Product decisions (owner)**

| Decision | Value |
|---|---|
| Product | **My Resume**: standalone iOS + Android app. No website, no web product |
| Repository | `MANZUL/MyResume` |
| iOS bundle ID / Android package | `com.manzul.myresume` |
| Language | English only in V1 |
| AI | None anywhere. Every feature is deterministic and on-device |
| Backend | None for normal use. Online only for store purchase, restore, refresh and subscription management |
| Product model | **FREE: Build + Edit + Preview. PREMIUM ($7.99/month): Export + premium tools** |
| Entitlement | One: **`premium`**. No per-template products or entitlements |
| Cover Letter | Always FREE |
| Payment providers (later) | Apple App Store subscription (iOS) and Google Play subscription (Android). No Dodo |

**Sources**
- The web repo `MANZUL/Resume` at `8e04af0` is the **product specification** only.
- The prototype in `resume-mobile/` is **not** a source of truth; §18 classifies it.
- This plan supersedes option C in `MOBILE_PARITY_AUDIT.md`.
- `PAYMENT_AUDIT.md` covers the web product and is not relevant to this app.

Types below are **design notation**, not code to paste in.

---

## 1. Complete feature inventory (specification) and tier

The inventory was extracted from the web code. Items marked ◇ are **new for mobile**; they are not in the spec but the owner requires them. Items marked † are my proposals and need confirmation (see the end of this document).

| # | Feature | Spec source | Mobile approach | Tier |
|---|---|---|---|---|
| 1 | Home value props (Upload → Improve → Apply). The spec's "$5 once / No subscription" copy is **replaced** with "Free to build, subscribe to export" | `home.tsx:298-506` | Native home | FREE |
| 2 | Live sample preview on home | `home.tsx:331-341` | Pre-rendered template image | FREE |
| 3 | Template gallery: 12 templates, categories, thumbnails, descriptions | `TemplateGallery.tsx` | Native gallery | FREE |
| 4 | Start from a template | `home.tsx:202-212` | Same | FREE |
| 5 | Brand | `home.tsx:282-287` | App name "My Resume"; icon and splash from the logo mark | — |
| ◇ | **Create an account** | not in spec | **Open decision; conflicts with "no backend".** V1 proposal: local profile, no sign-in (§4.6) | FREE |
| 6 | Upload PDF/DOCX | `resume-upload.ts` | On-device import (§8) | FREE |
| 7 | Paste resume / LinkedIn / notes → draft | `resume-parser.ts` (AI) | Deterministic parser + review (§8) | FREE |
| 8 | Parse / upload failure paths | `home.tsx:144-171` | Same | FREE |
| 9 | Create from scratch | `startBlank` | Same | FREE |
| 10 | Sample resume | `sample-data.ts` | Same content | FREE |
| 11 | Autosave (resume, template, accent, target JD) | `home.tsx:89-113` | SQLite autosave | FREE |
| 12 | Save / list / reopen resumes | `/resumes` API | Local library | FREE |
| 13 | Close editor | `handleClose` | Back navigation | FREE |
| 14–20 | Editor sections (personal, summary, experience, education, certifications, projects, awards) | `ResumeEditor.tsx` | Native forms | FREE |
| 21 | Empty-list hint copy | `ResumeEditor.tsx:361-365` | Same | FREE |
| 22 | Improve with AI (6 actions) | `ResumeEditor.tsx:408-466` | **Writing Coach**, deterministic (§3) | **PREMIUM** |
| 23 | Job Match | `ResumeTools.tsx`, `resume-ai.ts:104-180` | Local engine (§9) | **PREMIUM** |
| 24 | Tailoring suggestions | `ResumeTools.tsx:187-218` | Deterministic (§9) | **PREMIUM** |
| 25 | Resume Score / Check (score, warnings, jump-to-section, disclaimer) | `resume-score.ts` | Same rules | **FREE** |
| 26 | Cover Letter (generate, edit, copy) | `resume-ai.ts:182-219` | Deterministic, JD-aware (§10) | **FREE** |
| 27 | Use all 12 templates | `templates.ts`, `TemplateRenderer.tsx` | One data-driven renderer (§7) | **FREE** |
| 28 | Template picker; changing the template resets the accent | `home.tsx:578-616` | Same | FREE |
| 29 | Default customization: template default accent + the spec's 8 preset colors | `home.tsx:623` | Same palette | **FREE**† |
| 30 | Custom accent color (free hex/color picker) | `home.tsx:634-643` | Native picker | **PREMIUM**† ("premium customization") |
| 31 | In-app preview of the full resume | right panel | Preview screen, full resume, every page | **FREE** (with "PREVIEW" watermark) |
| 32 | PDF export | `window.print()` | Local PDF, Letter/A4 (§11) | **PREMIUM** |
| 33 | DOCX export | `export-docx.ts` | Spec generator (§11) | **PREMIUM** |
| ◇ | **Image export** (PNG per page) | not in spec | Rendered from the export PDF (§11) | **PREMIUM** |
| ◇ | **Share exported files/images** | spec: browser download | OS share sheet, called only by the export service | **PREMIUM** |
| ◇ | **Clean, unwatermarked output** (exports + preview) | — | The watermark exists only in the FREE preview | **PREMIUM** |
| 34 | Paywall | `ExportBar.tsx` | **Replaced**: one Premium subscription paywall (§4) | — |
| 35 | Entitlement per visitor + template | `payments.ts:25-33` | **Replaced**: one `premium` entitlement on the store account | — |
| 36 | Error boundary | `error-boundary.tsx` | Root boundary | FREE |

**Spec validation rules carried over**
- Pasted text: 50,000 characters max.
- Uploads: 8 MB max; PDF or DOCX; extension, MIME type and magic bytes must agree.
- Improve input: 6,000 characters max; context 300 max.
- Job description: 25,000 characters max.
- Analysis JSON: 60,000 characters max.
- Accent color must be a `#RRGGBB` hex value.
- Grounding: no number or specialized term may appear in output unless it is in the source.

**Invariant for every deterministic feature:** it never inserts a fact, number, skill, employer or date that is not already in the user's own text.

**Not carried over from the web app:** health indicator, SEO/OG, 404 page, visitor cookie, Dodo, rate limiting, `mockup-sandbox`.

---

## 2. Mobile-only feature architecture

```
src/
  app/            Expo Router screens (thin)
  features/       library/ editor/ templates/ preview/ export/ import/
                  job-match/ cover-letter/ coach/ check/ paywall/ settings/ profile/
  domain/         pure TypeScript: no React, React Native or Expo imports; unit-tested
    resume/ templates/ render/ parse/ match/ letter/ coach/ check/
    access/       PremiumFeature catalog + policy: requiresPremium(feature)
  services/       side effects behind injected interfaces
    storage/      SQLite repositories + migrations
    entitlement/  EntitlementService + StoreProvider implementations
    export/       ExportService: the only code that produces PDF/DOCX/PNG or calls share
    import/       picker + DOCX/PDF text extraction
  ui/             design system
```

**Rules**
- `domain/` never imports `services/`.
- Only `services/entitlement/providers/` may import a billing SDK.
- Network code is allowed nowhere else. A CI test enforces this, along with no AI.
- **Only `ExportService` may call `expo-print`, the DOCX packer, the image renderer, or `expo-sharing` for resume output.** A lint rule and test enforce this (§13).

**Screens**
- Home (library + value props + start actions)
- Template gallery
- Import → Review
- Editor (Coach entry points)
- Preview + template picker and customization (FREE: watermark)
- Export sheet (PDF / DOCX / Image; Letter or A4)
- Tools: Check (FREE), Cover Letter (FREE), Job Match (PREMIUM)
- Premium paywall (one plan)
- Settings: profile, subscription status, Manage subscription, Restore, backup, paper size, Terms, Privacy

---

## 3. AI → deterministic replacement map

| Spec AI feature | Deterministic replacement | Parity | Stated limitation | Tier |
|---|---|---|---|---|
| Parse pasted text | Rule-based parser + unassigned-lines bucket + review (§8) | Close for resumes that have headings | "Check each section; unplaced lines are listed." | FREE |
| Upload + parse | Text extraction on device from DOCX and text-based PDFs, then the same parser | Good for text-based files | No OCR for scanned PDFs | FREE |
| Improve / concise / professional / impact / grammar | **Writing Coach** rules with reasons and safe one-tap fixes | Suggestions, not rewrites | No free-form stylistic rewriting (non-AI limitation) | PREMIUM |
| Improve: measurable | "Can you add a measurable result here?" when a bullet has no number (the spec's own fallback) | Same | — | PREMIUM |
| Job Match keywords + title | Taxonomy + section weights + phrases + aliases (§9) | Close for common roles | Finite taxonomy | PREMIUM |
| Tailoring suggestions | Fact-preserving structural suggestions (§9) | Partial | Only reuses the user's own text | PREMIUM |
| Cover letter | JD-aware template generator (§10) | Close in structure | "Review and personalize." | FREE |

**Writing Coach rules**
- Weak openers, with strong-verb choices the user picks from.
- Filler words.
- Passive voice.
- First-person pronouns.
- Bullets longer than 32 words.
- Bullets with no measurable result.
- Mechanics, auto-fixable: spacing, capitalization, final periods, repeated words, a/an.
- Tense consistency.
- Repeated opening verbs.
- Wordy-phrase table, shown as a preview.

---

## 4. Payment / product architecture

### 4.1 Commercial model
- **One auto-renewing subscription at $7.99/month**, entitlement `premium`. The store localizes the price in other countries.
- No one-time purchases, no per-template products, no bundles in V1.
- When the user cancels, premium stays active until the end of the paid period.

### 4.2 FREE vs PREMIUM

| Capability | FREE | PREMIUM |
|---|---|---|
| Create, edit, save, duplicate and delete resumes | ✓ | ✓ |
| Import (paste, DOCX, PDF) + review | ✓ | ✓ |
| Browse and **use all 12 templates** | ✓ | ✓ |
| Default customization (template default accent + spec presets)† | ✓ | ✓ |
| Premium customization (custom accent color)† | — | ✓ |
| **In-app preview of the complete resume** | ✓ with a visible "PREVIEW" watermark | ✓ **no watermark** |
| Resume Score / Check | ✓ | ✓ |
| **Cover Letter** (generate, edit, copy) | ✓ | ✓ |
| Writing Coach, Job Match, Tailoring Suggestions | — (shown with a Premium badge; tapping opens the paywall) | ✓ |
| **PDF export** | — | ✓ |
| **DOCX export** | — | ✓ |
| **Image export (PNG)** | — | ✓ |
| **Share exported files/images** | — | ✓ |
| Backup of own data (raw JSON, not a rendered resume) | ✓ (data is never held hostage) | ✓ |

**Principles**
- There is no requirement to subscribe in order to create or edit.
- A lapsed subscription never locks user data. Every resume stays editable and previewable, with the watermark.
- A custom accent color that was already saved is kept. The preview still shows it.
- Tailoring edits the user already accepted remain, because they are now the user's text.
- **The engines always run locally.** Gating applies to features, not engines. For example, the free Cover Letter uses the Job Match engine internally.

### 4.3 Product configuration (IDs configured later)
```
BillingConfig {
  entitlementId: 'premium'
  ios:     { subscriptionGroup: 'My Resume Premium', productIds: ['<configure>'] }
  android: { subscriptionId: '<configure>', basePlanIds: ['<configure>'] }
  displayFallback: { price: '$7.99', period: 'month' }   // UI fallback only; the store price wins
}
```
All product IDs map to the one `premium` entitlement.

### 4.4 Entitlement abstraction (vendor-neutral)

```
PremiumStatus =
  | 'active' | 'grace_period'                                   // → premium
  | 'billing_retry' | 'paused' | 'pending'
  | 'expired' | 'revoked' | 'never_subscribed' | 'unknown'      // → not premium

EntitlementSnapshot {
  premium: boolean                 // derived by the policy below, never stored as a free-standing flag
  status: PremiumStatus
  expiresAt?: epochMs
  willRenew?: boolean
  source: 'store' | 'cache' | 'none'
  lastVerifiedAt?: epochMs
}

EntitlementService {
  isPremium(): Promise<boolean>     // THE gate. Evaluates the policy at call time (§4.5); never returns a stale boolean
  snapshot(): EntitlementSnapshot   // for UI only (badges, watermark, paywall), never used to authorize an export
  subscribe(listener): Unsubscribe
  refresh(): Promise<EntitlementSnapshot>   // silent; never prompts sign-in
  getOffer(): Promise<Offer | Unavailable>
  purchase(): Promise<'subscribed' | 'pending' | 'cancelled' | 'failed'>
  restore(): Promise<EntitlementSnapshot>
  manageSubscription(): Promise<void>
}

StoreProvider {                     // Apple / Google / (optional vendor) implementations
  currentEntitlements(): Promise<VerifiedSubscription[]>
  fetchOffers(config): Promise<Offer[]>
  buy(productId): Promise<VerifiedSubscription | Pending | Cancelled>
  sync(): Promise<VerifiedSubscription[]>
  onUpdate(listener)
  finish(tx): Promise<void>         // iOS finish / Android acknowledge
  openManagement(): Promise<void>
}

domain/access: PremiumFeature =
  'export.pdf' | 'export.docx' | 'export.image' | 'export.share'
  | 'coach' | 'jobMatch' | 'tailoring' | 'customize.customAccent' | 'preview.clean'
```

`FakeStoreProvider` handles development and tests. It is scriptable for every status, offline behavior and clock changes. Real providers come later, after separate approval.

### 4.5 Trust and offline policy (owner-approved)

- **Only a store-verified result can make the user premium.**
  - iOS: StoreKit 2 transactions verified by StoreKit.
  - Android: Play Billing purchases with state `PURCHASED` and a valid signature.
- Local storage caches that result **for UX only**. There is no user-editable flag that grants premium.
- **Effective cached premium deadline = `MIN(subscriptionExpiry, lastVerifiedAt + 7 days)`.**
  - Offline, cached premium is honored only until this deadline.
  - **No extra days after expiry.** A subscription that expires on day 3 of an offline period ends on day 3.
  - After the deadline, `isPremium()` returns false until a store refresh succeeds. The UI says "Connect to verify your subscription".
- **Clock guard.** A `clock_high_water_mark` is stored. If the device clock reads earlier than it, the cache counts as unverified and `isPremium()` is false until a refresh succeeds.
- `isPremium()` is true only when all of these hold:
  - status is `active` or `grace_period`;
  - the verified source is the store (live), or the cache within its deadline;
  - the clock guard passes.

### 4.6 Account ("Create an account") — open decision, no backend added

The owner listed "Create an account" as FREE. An account that exists off the device needs an authentication backend, which conflicts with "no backend for normal usage". Adding third-party login would also, on iOS, bring in the Sign in with Apple requirement (App Review 4.8).

The plan does **not** add a backend. Options:

| Option | What it is | Backend | Effect |
|---|---|---|---|
| **A (proposed for V1)** | **Local profile**: name, email and phone stored on the device and used to prefill new resumes. No sign-in. | None | Meets "free to create an account" in the product sense. The subscription is tied to the Apple ID / Google account, and resumes stay on the device |
| B | Sign in with Apple / Google, used only for identity (no sync) | Needs token verification if the identity is used for anything | Little benefit without sync |
| C | Real accounts with cloud sync | Needs auth + storage backend | Contradicts the current constraints; post-V1 |

Subscriptions **do not need an app account**. The store account is the purchase identity, and Restore works through it.

---

## 5. Offline data architecture

- SQLite is the source of truth for user data. There is no sync.
- Everything goes through repositories.
- **Derived data** (score, match results, Coach findings) is recomputed, not stored.
- **Edited cover letters** are stored.
- `entitlement_cache` holds store-derived facts, `lastVerifiedAt` and the clock mark. Only `EntitlementService` writes to it.
- The entitlement provider is the only network user.

---

## 6. Resume domain model

The content model is **identical to the spec's `ResumeData`** (`openapi.yaml`).

```
ResumeData { name, contact{phone,email,location,linkedin,website}, summary{tagline,bullets[],skills[]},
             experience[]{title,company,location,start,end,summary,bullets[]},
             education[]{degree,school,location,date,honors}, certifications[]{name,org,date},
             projects[]{name,description,bullets[]}, awards[] }

Resume        { id(uuid), title, templateId, accent, data, schemaVersion: 1, createdAt, updatedAt, deletedAt? }
Profile       { id, name, email, phone, location, createdAt, updatedAt }   // local "account" (§4.6, option A)
TargetJob     { id, resumeId, title, company, description, updatedAt }
CoverLetter   { id, resumeId, targetJobId?, tone, body, updatedAt }
ImportSession { id, sourceKind, rawText, draft, unassigned[], confidence }  // transient
ExportRecord  { id, resumeId, format: 'pdf'|'docx'|'png', paper, templateId, createdAt }  // local history (no file retained)
```

- No resume stores tier information. Tier is always evaluated at runtime.
- Validation follows the §1 limits.
- Migrations are pure functions per schema version, with tests.

---

## 7. Template architecture

- **Templates are data.** The 12 configs are copied verbatim from the spec. **All 12 are fully usable for FREE users.**
- **One renderer.** A self-contained HTML string drives three outputs:
  - the preview (a WebView with JavaScript off and navigation blocked);
  - the PDF;
  - the image export, which is rasterized from the PDF (§11).
- The parity target is the spec's `TemplateRenderer.tsx`.
- **Fonts:** Playfair Display and Plus Jakarta Sans (OFL), embedded so they work offline. The prototype's Georgia is a bug.
- **Thumbnails** are pre-rendered at build time.
- **Customization**
  - Changing the template resets the accent to its default.
  - FREE users get the template default plus the 8 spec presets†.
  - PREMIUM users also get a custom color†.
  - Paper size (Letter or A4) is a setting.
- **Watermark**
  - The FREE preview shows a large, diagonal "PREVIEW" watermark on **every page**, repeated so that no crop of a single page is clean.
  - Text in the preview is not selectable.
  - PREMIUM users see a clean preview.
  - The watermark is a render option (`watermark: boolean`). Only the preview path passes `true`; the export path never renders a watermark.
- **Screenshots:** the app **cannot prevent OS-level screenshots** on iOS or Android, and it does not try to.
  - The watermark makes a FREE screenshot visibly different from, and lower quality than, the official Premium export (vector PDF, DOCX, full-resolution PNG).
  - Android's `FLAG_SECURE` is not used. It works on Android only, blocks legitimate use, and would not match iOS behavior.
- **DOCX** follows the spec's generator.

---

## 8. Import architecture (FREE)

```
[Pick file | Paste] → extract → normalize → parse → Review → Resume
```

**Picking a file**
- `expo-document-picker` for PDF, DOCX and TXT.
- The spec limits apply: 8 MB max; extension, MIME type and magic bytes must agree.

**Extracting text**
- **DOCX:** JSZip unzips the file on the device; the text comes from `word/document.xml`, including paragraphs, numbering, tabs and tables.
- **PDF:** pdf.js runs offline in a hidden WebView. It rebuilds lines from glyph positions and keeps columns separate.
- **Scanned PDF:** there is no OCR. The app explains this and offers paste instead.

**Parsing**
- Heading dictionary and heuristics.
- Date grammar that ignores duration phrases.
- Grouping lines into entries.
- A LinkedIn-profile mode.
- A confidence value for each field.
- An **unassigned-lines bucket**: every line that could not be placed is kept.

**Review**
- The user confirms section by section.
- Low-confidence fields are highlighted.
- Any line can be moved to another section with one tap.

**Guarantees and failure**
- Every parsed value is a verbatim substring of the source. A test enforces this.
- If parsing fails, the app opens a blank editor and keeps the raw text available.
- The parser is tested against a corpus: a clean ATS resume, layout-heavy text, LinkedIn copy, notes, and two-column PDFs (English).

---

## 9. Job Match architecture (PREMIUM)

```
JD → segment → extract → normalize → weight → evidence → score + gaps + suggestions
```

**Segment.** The job description is split into: title, responsibilities, required, preferred, and about the company.

**Extract**
- Terms that match a bundled, versioned skills taxonomy, including aliases.
- 2–3 word phrases from requirement lines, after stopword and generic-term filters that drop terms like "nice", "team", "experience" and "5+".

**Weight.** Each term's weight = section weight × frequency × type. Section weights: required 1.0, responsibilities 0.7, preferred 0.5, other 0.3. The top 12–20 terms are kept.

**Evidence.** Terms are matched against the resume after normalization, alias lookup and light stemming. Each match records where in the resume it was found.

**Output**
- The job title.
- A weighted match percentage.
- `matched[]`, each with its evidence.
- `missing[]`, marked required or preferred.
- The spec's honesty copy.

**Tailoring suggestions (PREMIUM).** Each shows current → suggested with a reason, and offers Accept / Reject / Review. Four kinds:
1. A skill proven in a bullet but not in Skills → add it to Skills.
2. Reorder Skills so matched ones come first.
3. The resume uses an alias the JD spells differently → use the JD's name.
4. A term from the JD's title that appears in the user's experience → suggest it for the tagline.

**Persistence and regression.** Each resume stores a `TargetJob`. Regression pairs must:
- find SQL, A/B testing and stakeholder management;
- never emit "nice" or "5+";
- match "user research".

---

## 10. Cover Letter architecture (FREE)

**Inputs**
- The resume.
- Its `TargetJob`.
- The Job Match *engine* output. The engine runs locally even for FREE users.
- Optional overrides for manager, company and role.

**Extraction from the job description**
- Company and role are found with pattern rules.
- Anything that can't be found becomes a visible `[Company]` or `[Role]` placeholder.

**Evidence**
- The user's 2–3 best-overlapping bullets, quoted verbatim.
- Skills come only from `matched[]`.

**Composition**
- 3 tones × 4 paragraph templates.
- Wording variants are seeded deterministically, and "Regenerate" cycles through them.

**Guarantee.** Everything that is not fixed template text comes from the resume or the JD's company/role fields. A test enforces this.

**Output**
- The letter is editable and saved.
- **Copy to clipboard is FREE.**
- Sharing the letter *text* through the system text share is FREE†.
- There is no letter PDF/DOCX/image in V1. If one is added later, it goes through `ExportService` like any other export.

---

## 11. Export architecture (PREMIUM): PDF, DOCX, image, share

**Security boundary: `ExportService`, not the UI.** Every public method follows this sequence:

```
ExportService.exportPdf | exportDocx | exportImages (resumeId, options)
  1. if (!(await entitlement.isPremium()))  → throw PremiumRequired      // gate 1: before any generation
  2. load + validate Resume
  3. generate:
       PDF   → renderHtml(resume, {mode:'pdf', paper, watermark:false}) → expo-print printToFileAsync
       DOCX  → buildDocx(resume) → base64 → file
       IMAGE → PDF (as above) → rasterize each page to PNG (see below)
  4. write to an app-private export dir with a random file name; record ExportRecord
  5. return ExportHandle { id, format, pageCount }   // an opaque handle, NOT a file URI

ExportService.share(handle)
  1. if (!(await entitlement.isPremium()))  → throw PremiumRequired      // gate 2: before share
  2. resolve the handle → file; copy to a share-named file ("<Name>_<Template>.pdf|docx|png")
  3. expo-sharing shareAsync / (images) share or save
  4. delete the temp share copy after the share sheet closes; purge the export dir on launch
```

**Rules**
- `isPremium()` runs **twice**: before generation and before share. This closes the window where a subscription expires or a refund lands between the two steps.
- Checking the UI button state is never enough on its own.
- The paywall catches `PremiumRequired`. After a successful subscription, the original request runs again automatically.
- **Only `ExportService` imports** `expo-print`, the DOCX packer, the rasterizer or `expo-sharing` (for resume output). Lint and tests enforce this.
- Files are never exposed to features: they get handles, not paths. Exports left from an earlier premium period can't be re-shared once premium lapses, because `share()` checks again.
- Files the user has already shared outside the app are beyond the app's control. This is accepted.
- **Fully offline** while `isPremium()` is true, including from the cache within its deadline.

**Formats**
- **PDF**
  - Letter (612×792 pt) or A4 (595×842 pt), with 0.75 in margins.
  - Embedded fonts; text stays selectable.
  - Entries are never split across pages (`break-inside: avoid`).
  - Output must be verified on each platform.
- **DOCX:** the spec's generator.
- **Image (PNG)**
  - Each page is rasterized from **the same export PDF**, so the image matches the PDF exactly.
  - Primary method: the bundled pdf.js in an offline hidden WebView renders each page to a canvas at 2×–3× scale and returns PNG data.
  - Fallback: `react-native-view-shot` (bundled with SDK 57) capturing an offscreen, clean render.
  - Multi-page resumes produce one PNG per page, shared together.
  - Caps: resolution and page count are limited to bound memory use.

---

## 12. Storage architecture

**Engine:** `expo-sqlite` with WAL mode and versioned migrations. AsyncStorage is not used: it holds a single blob and has size limits on Android.

**Tables**

| Table | Contents |
|---|---|
| `profile` | local "account" (§4.6 A) |
| `resumes` | id, title, template_id, accent, data_json, schema_version, created/updated/deleted_at |
| `target_jobs` | id, resume_id, title, company, description, updated_at |
| `cover_letters` | id, resume_id, target_job_id, tone, body, updated_at |
| `export_records` | id, resume_id, format, paper, template_id, created_at |
| `entitlement_cache` | status, product_id, expires_at, will_renew, last_verified_at, clock_high_water_mark |
| `settings`, `meta` | — |

**Writes.** Autosave is debounced by about 400 ms, with one transaction per resume, using functional updates.

**Files.** Exports live in an app-private export directory. It is purged on every launch, and temporary share copies are deleted after the share sheet closes.

**User backup**
- The backup is raw data (JSON of profile, resumes, jobs and letters) and is **FREE**.
- It is not a rendered resume. It never includes the entitlement cache.
- Import merges records by id.

**OS backup**
- iOS: included in device backups.
- Android: Auto Backup is on (`allowBackup` defaults to true), up to 25 MB.
- Excluded from OS backups: the export directory and `entitlement_cache`. The store is re-queried after a restore.

---

## 13. Security model

**Assets:** the user's resume data, and the `premium` entitlement (export + tools).

### 13.1 How "verified" is established (decided when the provider is chosen)

| Option | iOS | Android | Backend? |
|---|---|---|---|
| **A (proposed for V1)** | StoreKit 2 `currentEntitlements` / `updates`, with StoreKit verifying the JWS | Play Billing `queryPurchasesAsync(SUBS)`, `PURCHASED`, signature | None |
| B | RevenueCat (Trusted Entitlements) | same | Third-party |
| C | App Store Server API | Play Developer API `subscriptionsv2` | Minimal verifier, used only for purchase and refresh |

The `StoreProvider` interface fits all three options.

### 13.2 Threats

| Threat | Control | Residual risk |
|---|---|---|
| FREE user calls export directly (patched UI, deep link, dev menu) | `isPremium()` inside `ExportService` before generation **and** before share. The UI is not the boundary | Only a patched binary on a rooted or jailbroken device (accepted; options B/C harden this) |
| Other code produces output without going through the service | Only `ExportService` may import print, DOCX, rasterizer or share for resume output (lint + test) | — |
| **OS screenshot or screen recording of the preview** | **Cannot be prevented, and the app does not claim to.** The FREE preview is watermarked on every page with non-selectable text. The official image export is PREMIUM and clean | The user gets a watermarked, screen-resolution image (accepted by design) |
| Re-sharing old exports after premium lapses | Handles instead of paths; `share()` re-checks; the export directory is purged on launch | Files already shared outside the app (accepted) |
| Edited local cache or storage | The cache is UX only, and a refresh overwrites it. No grant flag exists | Rooted devices can tamper (accepted / B, C) |
| Fake, replayed or modified purchase data | Grants come only from store-verified data (§4.5, §13.1) | Depends on the option chosen |
| Staying offline to keep premium | Deadline `MIN(expiry, lastVerifiedAt + 7d)`. No extension past expiry | Up to 7 days after a refund if the device stays offline |
| Clock rollback | High-water-mark guard | — |
| Expiry, refund, revocation, billing retry, account hold, pause, pending | Status mapping (§4.4), update listener, refresh on launch and foreground | — |
| Resume privacy | No network except billing. No analytics, no AI. Sandbox storage; purged exports; the backup file is labeled as personal data | The user controls what they share |
| Injection through resume content | HTML escaping; hex-only accent; WebView with JS off and no navigation (preview). The rasterizer WebView loads only bundled pdf.js and local data | — |
| AI or network creep | CI guard | — |

---

## 14. What happens when the app is offline

| Capability | Offline behavior |
|---|---|
| Create, edit, save, delete; import (paste, DOCX, text PDF); all 12 templates; default customization; **watermarked full preview**; Resume Score; **Cover Letter** (incl. copy); local profile; backup | **Works for everyone** |
| Premium: PDF / DOCX / image export, share, clean preview, Coach, Job Match, Tailoring, custom accent | Works only while `isPremium()` is true: status active or grace, before `MIN(expiry, lastVerifiedAt + 7d)`, clock guard OK. Otherwise locked with "Connect to verify your subscription" |
| Subscribe, restore, manage | Unavailable, with a message. The cache is unchanged |
| Paywall price | Cached store offer if one exists; otherwise `$7.99/month` fallback text, and the Subscribe button is disabled until online |

---

## 15. What happens after reinstall

1. **User data**
   - iOS deletes it on uninstall unless the device is restored from a backup.
   - Android may restore it through Auto Backup.
   - Otherwise the library and local profile start empty, and the app offers **Import backup**.
2. **Subscription**
   - A silent `refresh()` on first launch reads the store's current entitlements, without a sign-in prompt.
   - An active subscription unlocks export when the device is online.
   - Offline on first launch → not premium, because the cache is excluded from backups. This lasts until the first successful refresh.
   - **Restore purchases** is always available in the paywall and in Settings.
3. **Messaging.** The empty state explains the backup option. The app shows a backup reminder after the third resume or the first export.

---

## 16. What happens after a purchase (subscribe)

1. **Opening the paywall.** It opens from a premium entry point (Export, Share, Image, Coach, Job Match, Tailor, custom color) and remembers the pending request.
2. **Paywall content.** It shows the disclosures required by Apple 3.1.2 and Google policy:
   - "My Resume Premium, $7.99/month (localized), auto-renews";
   - what is unlocked: export + tools;
   - how to cancel;
   - intro-offer terms, if any†;
   - Terms and Privacy links;
   - Restore and Not now.
3. **Purchase.** `purchase()` opens the store sheet. Possible outcomes:
   - **Subscribed**
     1. The provider verifies the purchase and finishes or **acknowledges** it. Play auto-refunds purchases not acknowledged within 3 days.
     2. The cache is written and a premium snapshot is emitted.
     3. The watermark disappears.
     4. **The pending request runs again through `ExportService`**, which checks `isPremium()` again, then generates and shares.
   - **Pending** (Ask to Buy or deferred payment): "We'll unlock Premium when the purchase is approved." The update listener completes it later.
   - **Cancelled:** no change.
   - **Failed:** an error with a retry option. Nothing is granted.
   - **Already subscribed** on this store account: handled as a restore.
4. **Crash mid-purchase.** The unfinished transaction is delivered on the next launch.
5. **Later lifecycle**
   - A renewal extends `expiresAt`.
   - Cancel-at-period-end keeps access until expiry, with a notice in Settings.
   - Expiry or refund returns the user to FREE. Their data stays intact, and the preview becomes watermarked again.

---

## 17. What happens when a purchase is restored

1. The user taps **Restore purchases** in the paywall or in Settings. This needs a network connection.
2. `restore()` calls `sync()`, which may show the store's sign-in. It returns the verified subscription state.
3. The result maps to the entitlement:
   - active or grace → premium; `expiresAt` and `lastVerifiedAt` are refreshed;
   - otherwise → FREE, with a message: "No active subscription for this account" or "Expired on <date>".
4. **The cache is replaced** with the store's answer. A failed call never downgrades the user; a downgrade needs a successful store answer or the deadline passing.
5. **Offline or error:** the app shows a message and leaves the cache unchanged.
6. **Store account switch:** the refresh on launch and foreground picks up the new account's state. Resumes and the local profile stay on the device.

---

## 18. KEEP / REFACTOR / REWRITE / DELETE: current `resume-mobile`

| Module | Verdict | Reason |
|---|---|---|
| `src/lib/types.ts` | **REFACTOR** | Correct `ResumeData`. Add `schemaVersion`, `Profile`, `TargetJob`, `CoverLetter`, `ExportRecord` and uuids |
| `src/lib/sample-data.ts` | **KEEP** | Spec content |
| `src/lib/templates.ts` | **REFACTOR** | 12 configs verbatim. Add font metadata; no product IDs |
| `src/lib/text.ts` | **KEEP** | Escaping, hex validation, file names |
| `src/lib/resume-score.ts` | **KEEP** | Spec rules (FREE) |
| `src/lib/render-html.ts` | **REFACTOR** | Right approach, and its `watermark` option already fits. Wrong fonts, no A4, one watermark per document (needs one per page); parity pass needed |
| `src/lib/export-docx.ts` | **KEEP** | Spec generator; still has to be verified on a device |
| `src/lib/export.ts` | **REWRITE** | Must become `ExportService`: `isPremium()` at both gates, handles instead of paths, image export, share with its own gate, export directory and purge. The current version takes an `access` argument from the caller, so **the UI is effectively the boundary** |
| `src/lib/parse-text.ts` | **REWRITE** | Fails on LinkedIn-style text; no confidence scores; no unassigned bucket |
| `src/lib/job-match.ts` | **REWRITE** | Frequency-only, noisy |
| `src/lib/cover-letter.ts` | **REWRITE** | Ignores the job description |
| `src/lib/access.ts` | **REFACTOR** | The single-entitlement, fail-closed, dev-only idea fits. Add the statuses, `MIN(expiry, lastVerifiedAt + 7d)`, the clock guard and the `PremiumFeature` policy |
| `src/lib/purchases.tsx` | **DELETE** | RevenueCat wired straight into the UI; one-time-purchase model |
| `src/lib/store.tsx` | **REWRITE** | AsyncStorage blob → SQLite repositories |
| `src/components/ui.tsx` | **REFACTOR** | Move into `ui/` |
| `src/app/_layout.tsx` | **REFACTOR** | New providers; error boundary |
| `src/app/index.tsx` | **REFACTOR** | Keep the library. Add "free to build" home content |
| `src/app/import.tsx` | **REWRITE** | File + paste → review |
| `src/app/resume/[id]/index.tsx` | **REFACTOR** | Keep the forms. Add stable keys, jump-to-section, Coach badges and hooks |
| `src/app/resume/[id]/preview.tsx` | **REFACTOR** | Keep the WebView. The watermark follows the tier. Export buttons call `ExportService` and handle `PremiumRequired`. Add the spec palette, the custom color (premium) and the category picker |
| `src/app/resume/[id]/tools.tsx` | **REWRITE** | Check and Cover Letter FREE, Job Match PREMIUM; persist the job description; suggestions |
| `src/app/unlock.tsx` | **REWRITE** | Premium subscription paywall with 3.1.2 disclosures and pending-request resume |
| `src/__tests__/access.test.ts` | **REFACTOR** | Add statuses, the deadline formula (including "no extension past expiry") and the clock guard |
| `src/__tests__/parse-text.test.ts` | **REWRITE** | Corpus suite |
| `src/__tests__/tools.test.ts` | **REFACTOR** | Keep the escaping, injection, DOCX and no-AI/network guards. Add the "only ExportService produces output" guard |
| `app.json` | **REFACTOR** | "My Resume", `com.manzul.myresume`, icons; `BILLING` only when billing lands |
| `assets/*.png` | **DELETE** | Expo placeholders |
| `eas.json`, tooling, `AGENTS.md`, `CLAUDE.md` | **KEEP** | — |
| Deps `react-native-purchases`, `react-dom`, `react-native-web` | **DELETE** | RevenueCat and its web peer dependencies |
| Dep `@react-native-async-storage/async-storage` | **DELETE** | Replaced by SQLite |
| `README.md` | **REWRITE** | Describes the prototype's one-time unlock |
| `PAYMENT_AUDIT.md` | **DELETE** (or archive) | Covers the web product |
| `MOBILE_PARITY_AUDIT.md` | **KEEP** (history) | Its evidence still holds |
| Location `Cal-/resume-mobile` | **MOVE** | To `MANZUL/MyResume` |

**Tally:** KEEP 7 (counting `eas.json` and tooling separately) · REFACTOR 12 · REWRITE 10 · DELETE 5, plus 1 move. The only change from revision 2 is that `export.ts` moved from REFACTOR to REWRITE.

---

## 19. Migration order

Every step ends green: typecheck, lint, tests, and the no-AI/no-network guard. Steps marked ◆ also need a device QA gate.

| Step | Work | Exit criteria |
|---|---|---|
| 0 | Create `MANZUL/MyResume`; move the prototype; set identity (My Resume, `com.manzul.myresume`); brand assets. Answer the open decisions, **especially the account question (§4.6)** | Repo builds |
| 1 | Restructure into `domain/ services/ features/ ui/`. Delete RevenueCat, the web dependencies and AsyncStorage | Green |
| 2 | Domain model v1 (including `Profile`, `ExportRecord`); SQLite repositories and migrations; library; local profile | CRUD and migration tests |
| 3 | **Entitlement architecture:** `EntitlementService.isPremium()` policy (statuses, `MIN(expiry, lastVerifiedAt + 7d)`, clock guard); `FakeStoreProvider`; `PremiumFeature` catalog; premium paywall (fake offer, 3.1.2 layout, pending-request resume); Settings subscription section | Scripted tests for: subscribe, pending, cancel-at-period-end, renew, expire (**including offline: no extension past expiry**), grace, retry, pause, refund, offline within and beyond 7 days, clock rollback, reinstall |
| 4 | **`ExportService`** with both gates, handles, export directory and purge; PDF + DOCX; share; architecture guard test (only the service produces output); FREE users get `PremiumRequired` → paywall → auto-resume | Unit tests for the gates (FREE denied before generation and before share; expiry between generate and share denied) ◆ PDF and DOCX on both platforms |
| 5 | Renderer parity (fonts, rules, Letter/A4), **per-page watermark** in the FREE preview, thumbnails, gallery, picker, spec palette (FREE) + custom color (PREMIUM) | ◆ Visual parity; watermark visible on every page in FREE, absent in PREMIUM |
| 6 | **Image export**: PDF → PNG via pdf.js (fallback: view-shot), per page, through `ExportService` | ◆ PNG matches the PDF on both platforms; memory caps respected |
| 7 | Editor parity; Resume Score (FREE) with jump-to-section | ◆ Editor pass |
| 8 | Writing Coach (PREMIUM) | Rule tests; no-fact-insertion |
| 9 | Import (FREE): parser rewrite + corpus, review, DOCX, PDF | Corpus thresholds ◆ real files |
| 10 | Job Match + taxonomy + tailoring (PREMIUM); then Cover Letter (FREE) on the shared engine | Regression pairs; letter grounding; gating test (letter works while FREE) |
| 11 | **(Separate approval)** Real `StoreProvider`s (option A proposed); App Store subscription group + product; Play subscription + base plan; product IDs in `BillingConfig`; Terms and Privacy URLs; sandbox tests of the full lifecycle | ◆ Full matrix on both stores |
| 12 | Backup, settings, error boundary, accessibility, low-end Android performance | ◆ Release-candidate QA |
| 13 | **(Separate approval)** EAS builds and store submission | — |

---

## 20. Major risks and failure modes

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **"Free to build" makes screenshots a substitute for export** | Lower conversion | Per-page watermark, non-selectable text, screen-resolution only. The paid output is vector PDF, editable DOCX and a clean high-resolution PNG. No false claim of screenshot prevention |
| 2 | App Review 3.1.2: auto-renewing subscriptions must provide ongoing value | Rejection | Ongoing tools (Job Match and tailoring per application, Coach, unlimited exports); full disclosures; review notes |
| 3 | Subscribe → export → cancel churn | Revenue | Owner's commercial model; watch retention after launch |
| 4 | **"Create an account" vs no backend** | Scope creep, or a missed expectation | §4.6 decision before step 0 completes; V1 proposal is a local profile |
| 5 | On-device verification (option A) can be tampered with on rooted devices | Revenue leakage | Accept for V1, or move to B/C (same interface) |
| 6 | Refund while the device stays offline | Up to 7 days of continued premium | Accepted consequence of the approved policy; never extends past expiry |
| 7 | Subscription lifecycle edge cases | Wrong tier | Status mapping, listener, refresh, step-11 matrix |
| 8 | Play acknowledgement missed | Automatic refund | Acknowledge inside the provider; process on next launch |
| 9 | Image export memory and quality (pdf.js rasterization on low-end Android) | Crashes or blurry images | Scale caps, page caps, fallback renderer, device QA |
| 10 | iOS vs Android print differences | PDF differs from the preview | Embedded fonts; golden files |
| 11 | **Data loss** without a server | Lost resumes | Free backup; OS backup; reminders |
| 12 | Parser accuracy / no OCR | Poor first impression | Review step, unassigned bucket, paste fallback |
| 13 | Taxonomy coverage (English only) | Weak matches | Versioned taxonomy with phrase fallback |
| 14 | Non-AI experience feels weaker than the spec's AI | Perceived quality | Honest copy; never claim AI |
| 15 | Legal pages required (Terms, Privacy) | Submission blocked | Static hosted pages, not an app backend |
| 16 | Keeping prototype code because tests pass | Drift from the spec | §18 classification plus a parity checklist |

---

## Decisions

**Resolved**
- Mobile-only; no AI; offline-first; no backend for normal use.
- `MANZUL/MyResume`; "My Resume"; `com.manzul.myresume`; English only in V1.
- **Free to build, paid to export.** $7.99/month `premium` subscription; no template products.
- Cover Letter FREE; Resume Score FREE; all 12 templates FREE to use and preview.
- Offline premium deadline = `MIN(subscriptionExpiry, lastVerifiedAt + 7 days)`.
- Enforcement lives in `ExportService` through `EntitlementService.isPremium()`.
- No claim of screenshot prevention.

**Open (marked † above). Proposals in brackets:**
1. **"Create an account"**: local profile, sync, or no backend? [Option A: local profile, no sign-in, no backend]
2. Split between default and premium customization. [FREE: template default + the 8 spec presets. PREMIUM: custom color]
3. Share Cover Letter *text* through the system share sheet: FREE? [yes; copy is already free; there is no letter file export in V1]
4. Free trial or intro offer? [none in V1]
5. Family Sharing? [off]

**Deferred to step 11:** verification option [A]; product IDs; Terms and Privacy URLs.

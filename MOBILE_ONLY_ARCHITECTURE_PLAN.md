# My Resume — mobile-only architecture plan

**Status:** revision 3 approved; open decisions resolved (see the end of the document). **Steps 0–9 are done in code** (§19, §19.1–§19.9); device validation of steps 4–9 is still open. Step 9 is the owner-approved ATS Readability Checker (scope amendment in §19.9); Import moved to step 9b. No billing SDK, no AI, no EAS builds.

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

The inventory was extracted from the web code. Items marked ◇ are **new for mobile**; they are not in the spec but the owner requires them. All tier decisions are approved.

| # | Feature | Spec source | Mobile approach | Tier |
|---|---|---|---|---|
| 1 | Home value props (Upload → Improve → Apply). The spec's "$5 once / No subscription" copy is **replaced** with "Free to build, subscribe to export" | `home.tsx:298-506` | Native home | FREE |
| 2 | Live sample preview on home | `home.tsx:331-341` | Pre-rendered template image | FREE |
| 3 | Template gallery: 12 templates, categories, thumbnails, descriptions | `TemplateGallery.tsx` | Native gallery | FREE |
| 4 | Start from a template | `home.tsx:202-212` | Same | FREE |
| 5 | Brand | `home.tsx:282-287` | App name "My Resume"; icon and splash from the logo mark | — |
| ◇ | **Local Profile** (owner's "create an account", decided as device-only) | not in spec | On-device profile that pre-fills resumes; no login, no cloud (§4.6) | FREE |
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
| 29 | Default customization: template default accent + the spec's 8 preset colors | `home.tsx:623` | Same palette | **FREE** |
| 30 | Custom accent color (free hex/color picker) | `home.tsx:634-643` | Native picker | **PREMIUM** ("premium customization") |
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
                  job-match/ cover-letter/ coach/ check/ paywall/ settings/ local-profile/
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
- Settings: Local Profile, subscription status, Manage subscription, Restore, backup, paper size, Terms, Privacy

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
| Default customization (template default accent + spec presets) | ✓ | ✓ |
| Premium customization (custom accent color) | — | ✓ |
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

### 4.6 Local Profile (approved; replaces "Create an account")

The product has a **Local Profile**. It is **not an account**.

- **Fields:** name, email, phone, location, job title / headline, LinkedIn, website. These are the profile-type fields of `ResumeData.contact` plus the tagline.
- **Stored only on the device**, in SQLite. It is included in the user's own backup file.
- **Purpose:** pre-fills the personal details and headline of new resumes. It never overwrites an existing resume.
- **There is none of:** login, password, cloud account, backend identity system, cloud sync.
- **FREE** for everyone, and it works offline.
- **Purchases and Restore** use the user's Apple ID / Google account through the native store APIs. The app has no identity of its own for billing.
- UI copy says "Profile" or "Local Profile", **never "Account" or "Sign in"**.

---|---|---|---|
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

Resume        { id, title, templateId, accent, data, createdAt, updatedAt }   // as built in step 2 (§19.2); hard delete
LocalProfile  { id, name, email, phone, location, headline, linkedin, website, updatedAt }   // device-only, no login (§4.6)
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
  - FREE users get the template default plus the 8 spec presets.
  - PREMIUM users also get a custom color.
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
- Sharing the letter *text* through the system text share is FREE.
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

**Tables (schema version 1, built in step 2).** Only what the MVP needs today. Later steps add tables through new migrations when their features land.

| Table | Contents | Added in |
|---|---|---|
| `resumes` | id, title, template_id, accent, data_json, is_active, created_at, updated_at. A partial unique index allows at most one active resume | Step 2 ✅ |
| `local_profile` | single row (`id = 1`): name, email, phone, location, headline, linkedin, website, updated_at | Step 2 ✅ |
| `export_records` | id, resume_id (becomes NULL when the resume is deleted), template_id, export_type (`pdf`/`docx`, and `png` from schema v2), outcome (`succeeded`/`failed`/`denied`), access_reason, error_message, created_at. **No file path or file content** | Step 2 ✅ |
| `target_jobs` | id, resume_id, title, company, description, updated_at | Step 10 (Job Match) |
| `cover_letters` | id, resume_id, target_job_id, tone, body, updated_at | Step 10 (Cover Letter) |
| ~~`entitlement_cache`~~ | **Not a table.** Step 3 stores the offline entitlement cache in its own key-value file, `my-resume-entitlement.db`, separate from the resume database (see §19.3) | Step 3 ✅ |

The schema version is kept in SQLite's `PRAGMA user_version`. There is no `meta` or `settings` table.

**Writes.** Autosave is debounced (600 ms after the last edit, and at least every 3 s while typing). It writes one resume at a time, and pending edits are flushed when a screen loses focus or the app leaves the foreground (§19.2).

**Files.** Exports live in an app-private export directory. It is purged on every launch, and temporary share copies are deleted after the share sheet closes.

**User backup**
- The backup is raw data (JSON of the Local Profile, resumes, jobs and letters) and is **FREE**.
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
| Create, edit, save, delete; import (paste, DOCX, text PDF); all 12 templates; default customization; **watermarked full preview**; Resume Score; **Cover Letter** (incl. copy); Local Profile; backup | **Works for everyone** |
| Premium: PDF / DOCX / image export, share, clean preview, Coach, Job Match, Tailoring, custom accent | Works only while `isPremium()` is true: status active or grace, before `MIN(expiry, lastVerifiedAt + 7d)`, clock guard OK. Otherwise locked with "Connect to verify your subscription" |
| Subscribe, restore, manage | Unavailable, with a message. The cache is unchanged |
| Paywall price | Cached store offer if one exists; otherwise `$7.99/month` fallback text, and the Subscribe button is disabled until online |

---

## 15. What happens after reinstall

1. **User data**
   - iOS deletes it on uninstall unless the device is restored from a backup.
   - Android may restore it through Auto Backup.
   - Otherwise the library and Local Profile start empty, and the app offers **Import backup**.
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
6. **Store account switch:** the refresh on launch and foreground picks up the new account's state. Resumes and the Local Profile stay on the device.

---

## 18. KEEP / REFACTOR / REWRITE / DELETE: current `resume-mobile`

| Module | Verdict | Reason |
|---|---|---|
| `src/lib/types.ts` | **REFACTOR** | Correct `ResumeData`. Add `schemaVersion`, `LocalProfile`, `TargetJob`, `CoverLetter`, `ExportRecord` and uuids |
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
| 0 ✅ | Create `MANZUL/MyResume`; move the prototype; set identity (My Resume, `com.manzul.myresume`); brand assets; record decisions. **Done**: prototype history imported, identity and assets set, decisions recorded | Repo builds ✅ |
| 1 ✅ | Restructure into `domain/ services/ features/ ui/`. Delete RevenueCat, the web dependencies and AsyncStorage. **Done** (see §19.1) | Green ✅ |
| 2 ✅ | Domain model v1 (including `LocalProfile`, `ExportRecord`); SQLite repositories and migrations; library; Local Profile. **Done** (see §19.2) | CRUD and migration tests ✅ |
| 3 ✅ | **Entitlement architecture:** **Done** (see §19.3). `EntitlementService.isPremium()` policy (statuses, `MIN(expiry, lastVerifiedAt + 7d)`, clock guard); `FakeStoreProvider`; `PremiumFeature` catalog; premium paywall (fake offer, 3.1.2 layout, pending-request resume). *The Settings subscription section was not built in step 3 (new UI); it moves to step 12 with the other settings* | Scripted tests for: subscribe, pending, cancel-at-period-end, renew, expire (**including offline: no extension past expiry**), grace, retry, pause, refund, offline within and beyond 7 days, clock rollback, reinstall ✅ |
| 4 ✅ | **`ExportService`** with both gates, handles, export directory and purge; PDF + DOCX; share; architecture guard test (only the service produces output); FREE users get `PremiumRequired` → paywall → auto-resume. **Done** (see §19.4) | Unit tests for the gates ✅ ◆ PDF and DOCX on both platforms: **still open** (no device yet) |
| 5 ✅ | Renderer parity (rules, Letter/A4), **watermark** in the FREE preview, Boardroom/Foreman mark overlap. **Done, narrowed scope** (see §19.5). *Bundled spec fonts, thumbnails, gallery, paper picker and the custom-color UI were taken out of step 5 by the owner and move to step 12* | Layout tests in a real engine ✅: no text under a mark, preview/PDF geometry parity, watermark coverage and readability, no watermark in PREMIUM or PDF ◆ WebView and `expo-print` on devices: **still open** |
| 6 ✅ | **Image export**: PDF → PNG via pdf.js, per page, through `ExportService`. **Done in code** (see §19.6); the view-shot fallback was not needed | End-to-end in Chromium ✅ (real renderer → PDF → bundled pdf.js → PNG) ◆ PNG on both platforms and memory on low-end Android: **still open** |
| 7 ✅ | Editor parity; Resume Score (FREE) with jump-to-section. **Done in code** (see §19.7) | Pure-logic and guard tests ✅ ◆ Editor pass on devices: **NOT RUN** (no simulator or device in this environment) |
| 8 ✅ | Writing Coach (PREMIUM). **Done in code** (see §19.8) | Rule tests ✅; no-fact-insertion ✅ (property tests + grounding guard + mutation checks) ◆ Coach panel on devices: **NOT RUN** |
| 9 ✅ | **ATS Readability Checker (FREE)**: owner-approved addition (Near-Term Features #1). **Done in code** (see §19.9) | Rule corpus ✅; template claims verified against real PDF and DOCX output ✅ ◆ ATS tab on devices: **NOT RUN** |
| 9a ✅ | **PDF typography / ATS extraction fix** (owner-approved): heading and upper-case-name letter-spacing set to 0.08em. **Done** (see §19.9a) | 12/12 PDFs extract whole words (pdf.js + pdfminer.six) ✅; no layout change ✅ ◆ `expo-print` on devices: **NOT RUN** |
| 9b | Import (FREE): parser rewrite + corpus, review, DOCX, PDF. *(Was step 9; moved after the ATS checker by the owner. Not started)* | Corpus thresholds ◆ real files |
| 10 | Job Match + taxonomy + tailoring (PREMIUM); then Cover Letter (FREE) on the shared engine | Regression pairs; letter grounding; gating test (letter works while FREE) |
| 11 | **(Separate approval)** Real `StoreProvider`s (option A proposed); App Store subscription group + product; Play subscription + base plan; product IDs in `BillingConfig`; Terms and Privacy URLs; sandbox tests of the full lifecycle | ◆ Full matrix on both stores |
| 12 | Backup, settings, error boundary, accessibility, low-end Android performance; items moved from step 5 (bundled spec fonts, thumbnails, gallery, paper picker, custom-color UI) | ◆ Release-candidate QA |
| 13 | **(Separate approval)** EAS builds and store submission | — |

---

### 19.1 Step 1 record: what was removed, what was retained, and why

Step 1 was cleanup and restructuring only. **No product behavior changed.** Templates, parser,
Job Match, Cover Letter, Resume Score, preview and export behave exactly as before.

**Removed**

| Item | Why |
|---|---|
| `react-native-purchases` (and its `@revenuecat/*` internals) | RevenueCat is out of scope; billing will come through the vendor-neutral entitlement service (§4.4) |
| `src/lib/purchases.tsx` (the RevenueCat provider, `usePurchases`) | Replaced by `services/entitlement/entitlement.tsx` (`EntitlementProvider`, `useEntitlement`). There is no billing SDK and no network. It uses the same fail-closed policy with billing "not configured": debug builds are unlocked, release builds locked. That is the state the prototype always ran in, so behavior is unchanged |
| `@react-native-async-storage/async-storage` | Plan §12: SQLite only. Replaced by `services/storage/kv.ts`, which uses `expo-sqlite/kv-store` (`SQLiteStorage`, database `my-resume-kv.db`) with the **same key (`resumes.v1`) and same JSON format**. Step 2 replaces it with real tables. No user data exists to migrate; the prototype was never released |
| `react-dom`, `react-native-web` as **direct** dependencies | Added only for RevenueCat's web peer dependency; there is no web target |
| Android `com.android.vending.BILLING` permission (`app.json`) | Re-added only when real Google Play billing lands (step 11) |
| `.env.example` | It held only RevenueCat keys |
| `PAYMENT_AUDIT.md` | Audit of the web app's Dodo payments. The web product is not being built; the file stays in git history |
| Payment/RevenueCat/AsyncStorage wording in `README.md` and the `access.ts` comment | Replaced with accurate, vendor-neutral text. README is kept minimal until its planned rewrite |
| Tooling for a web target | Already absent (no `web` script or `web` config in `app.json`); now enforced by a test |

**Retained, and why**

| Item | Why |
|---|---|
| `domain/access/access.ts` (`resolveExportAccess`) | Business logic: the fail-closed policy that rejects failed verification and unlocks only in dev. It is refactored into the premium/`isPremium()` model in step 3 |
| `domain/render/export-docx.ts`, `render-html.ts`, `templates.ts`, `sample-data.ts`, `resume-score.ts`, `parse-text.ts`, `job-match.ts`, `cover-letter.ts`, `types.ts` | Domain logic, moved without changes. Several are later REFACTOR/REWRITE targets (§18) |
| `services/export/export.ts` | Export behavior unchanged. It is rewritten into `ExportService` in step 4 |
| `features/paywall/UnlockScreen.tsx` | Same screen and copy. It now reads `offer` from the entitlement service instead of RevenueCat's `exportPackage`. It is rewritten in step 3 |
| `react-dom`, `react-native-web` inside `node_modules` (transitive) | `expo-router` depends on them for its web renderer and cannot run without them installed. **They are not in the iOS or Android bundles**: source-map check, 0 modules on both platforms |
| `react-native-webview`, `expo-print`, `expo-sharing`, `expo-file-system`, `expo-clipboard`, `docx` | Needed by existing mobile features (preview, export, cover-letter copy) |
| Android `INTERNET`, `VIBRATE`, `SYSTEM_ALERT_WINDOW`, legacy storage permissions (≤ API 32) | Expo / React Native template defaults. `INTERNET` is needed for the development server now and for store billing later. **Core features make no network calls** (guard test) |
| `.replit` | The owner's workspace configuration from the repository's initial commit. It is not app runtime |

**Added**
- `expo-sqlite`, with its config plugin.
- `services/storage/kv.ts`.
- `services/entitlement/entitlement.tsx`, a vendor-neutral placeholder.
- Thin route files in `src/app/`.
- `src/__tests__/architecture.test.ts`, which enforces:
  - no removed packages are declared or imported;
  - no billing permission and no web configuration;
  - `domain/` stays pure (no React, React Native, Expo, services, features or ui imports);
  - `app/` routes stay thin;
  - only the entitlement service owns purchase state;
  - no network APIs or remote URLs;
  - storage is SQLite.

  I also broke the rules on purpose (re-added an AsyncStorage import and the billing permission) to
  confirm these tests fail, then reverted.

**Module moves** (made with `git mv`, so history is kept)

| Before | After |
|---|---|
| `src/lib/types.ts`, `sample-data.ts` | `src/domain/resume/` |
| `src/lib/templates.ts` | `src/domain/templates/` |
| `src/lib/text.ts` | `src/domain/shared/` |
| `src/lib/resume-score.ts` | `src/domain/check/` |
| `src/lib/render-html.ts`, `export-docx.ts` | `src/domain/render/` |
| `src/lib/parse-text.ts` | `src/domain/parse/` |
| `src/lib/job-match.ts` | `src/domain/match/` |
| `src/lib/cover-letter.ts` | `src/domain/letter/` |
| `src/lib/access.ts` | `src/domain/access/` |
| `src/lib/store.tsx` | `src/services/storage/resume-store.tsx` |
| `src/lib/export.ts` | `src/services/export/export.ts` |
| `src/lib/purchases.tsx` | `src/services/entitlement/entitlement.tsx` (content replaced) |
| `src/components/ui.tsx` | `src/ui/components.tsx` |
| `src/app/index.tsx`, `import.tsx`, `unlock.tsx`, `resume/[id]/{index,preview,tools}.tsx` | `src/features/{library,import,paywall,editor,preview,tools}/*Screen.tsx`; `src/app/*` re-export them |
| Tools screen sub-components | `features/check/CheckTool.tsx`, `features/job-match/MatchTool.tsx`, `features/cover-letter/LetterTool.tsx` (code moved as-is) |

**Validation**

| Check | Result |
|---|---|
| Clean install (`npm ci` from an empty `node_modules`) | ✅ |
| `tsc --noEmit` | ✅ |
| `expo lint` | ✅ |
| Tests | **31 passed** (23 existing + 8 architecture guards) |
| iOS bundle | ✅ 2.7 MB (was 5 MB) |
| Android bundle | ✅ 3.0 MB (was 5.3 MB) |
| Bundle contents (source maps) | 0 modules each on iOS and Android from `react-dom`, `react-native-web`, `react-native-purchases`, `@revenuecat`, `@react-native-async-storage` |
| Generated native projects (`expo prebuild`, then deleted) | No `BILLING`, RevenueCat or AsyncStorage anywhere. Expo modules linked: `expo-sqlite` present, no purchases module |
| On a device | **Not run.** No simulator or device was available. Runtime of the SQLite key-value store and export is still unverified on devices |

### 19.2 Step 2 record: SQLite data architecture

Step 2 is the data foundation only. **No product behavior or UI changed**: the same screens, templates, parser, Job Match, Cover Letter, Resume Score, preview and export behavior.

**Layering.** The domain never imports SQLite; a guard test enforces this.

```
domain/                       types + normalizers + repository interfaces (ports)
  resume/normalize.ts         repairs malformed stored resumes (never invents content)
  profile/local-profile.ts    LocalProfile (device-only)
  export/export-record.ts     ExportRecord (metadata only)
  ports/repositories.ts       ResumeRepository, LocalProfileRepository, ExportRecordRepository
        ↓
services/storage/sqlite/      SQL implementation, independent of Expo
  sql.ts                      minimal SqlDatabase interface (exec/run/get/all/transaction)
  schema.ts, migrate.ts       versioned migrations (PRAGMA user_version)
  *-repository.ts             the three repositories
  database.ts                 connection setup (WAL, foreign keys) + migrate + build repositories
        ↓
services/storage/expo-database.ts   expo-sqlite adapter (devices)
__tests__/helpers/node-sqlite.ts    node:sqlite adapter (tests: same SQL, real SQLite engine, real files)
```

**Schema v1.** Three tables only: `resumes`, `local_profile`, `export_records` (§12).
- **Active resume:** stored in an `is_active` column. A partial unique index makes a second active resume impossible at the database level. It is set when the editor opens a resume.
- **Delete:** a hard delete, as in the prototype. Export history rows keep the template and type; their `resume_id` becomes NULL.
- **Export records:** metadata only. They are written *after* the access decision and never read by the export path. This is guarded by tests. No file paths are stored.

**Migrations.**
- Each migration and its version bump run in **one exclusive transaction**, so a failure rolls back completely and the version stays unchanged.
- Re-running is a no-op (idempotent).
- A database from a newer app version is refused, untouched (`SchemaTooNewError`), and the app shows an "update the app" message. Nothing is deleted.
- Migration 1 imports resumes from the Step 1 key-value store **once**:
  - valid records are copied;
  - malformed ones are repaired;
  - unusable ones (no id, not an object) are skipped;
  - the old key is removed after a successful import.

**Recovery from expected storage errors.**
- A row whose JSON can't be read is skipped and reported, **not deleted**.
- Wrong-shaped content, unknown template ids and invalid colors are repaired on read.
- A Local Profile with bad values is repaired.
- If the database can't be opened, the app shows a message with "Try again" and **does not reset data**.

**Autosave.** `ResumeLibrary` (plain TypeScript) plus `createAutosaver`:
- create and duplicate are written immediately;
- edits are debounced (600 ms after the last change, and at least every 3 s while typing);
- writes for one resume never overlap, and the newest value wins;
- failed writes stay pending and are retried;
- a pending edit cannot bring a deleted resume back.

Flush points:
- **Editor or Preview screen losing focus:** that resume is flushed (`useFocusEffect`).
- **App leaving the foreground:** everything is flushed (`AppState`).

The window that can be lost if the OS kills the app mid-typing is bounded by the debounce (≤ 600 ms, ≤ 3 s while typing continuously). This is covered by a test.

**Dependencies.** No new packages. The legacy key-value file is still read once through `expo-sqlite/kv-store` (renamed to `legacy-kv.ts`).

**Tests added:** 48, for **79 in total**. All 31 earlier tests are unchanged and passing.

| Area | What is tested |
|---|---|
| Schema version | explicit version 1; matches the last migration |
| Fresh install | exactly 3 tables; version recorded; WAL mode and foreign keys on; no path/file columns |
| Repeated migration, restart | no-op re-run; close + reopen keeps data and does not re-migrate |
| Existing install (Step 1 data) | valid, malformed and unusable legacy records; missing, empty, non-JSON and throwing legacy store; imported only once |
| Existing database upgrade | a test-only v2 migration applies on top of v1 with data kept; a failed v2 rolls back fully; a newer schema is refused; gaps in migration numbers are rejected |
| Resumes | CRUD, many resumes, ordering, template and color persistence, duplicate ids, save to a missing id, restart persistence |
| Active resume | none by default; exactly one; enforced by the database; survives restart; cleared on delete |
| Invalid or missing data | unreadable JSON skipped, reported and kept; wrong shapes, unknown template and bad color repaired; missing records return null |
| Local Profile | empty default; save, update and restart; single row enforced; bad values repaired |
| Export records | append and list (recent and per resume), survive restart, kept after the resume is deleted, unknown type or outcome rejected by the database, recorded outcomes (denied without generating, succeeded, failed), a broken recorder never changes the export result |
| Autosave | debounce coalescing, max-wait during continuous typing, flush, no overlapping writes, retry after failure, cancel |
| Edits survive | screen navigation (flush on blur), app restart (new connection), simulated process kill after a flush, and the bounded loss of an unflushed debounce window |
| Architecture | only `services/storage` touches SQLite; export code never reads export records; no path column |

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a real device or simulator |
|---|---|
| All SQL, migrations and repositories against a **real SQLite engine** (Node's `node:sqlite`, SQLite 3.51) on **real database files**, including reopen and restart | `expo-sqlite` itself on iOS and Android: opening `my-resume.db`, WAL, `withExclusiveTransactionAsync`. The Expo adapter is type-checked and bundled, but it has **never been executed** |
| Autosave timing with a controlled clock; flush and ordering logic | Real `AppState` background flush and `useFocusEffect` flush on navigation |
| Crash durability approximated by opening a second connection without closing the first | A real OS kill of the app process |
| The Step 1 legacy import, from fixture JSON | Reading a real Step 1 key-value file on a device |
| Typecheck, lint, iOS and Android bundles (the storage modules are present in both, per source maps) | The database error screen and retry on a device |

### 19.3 Step 3 record: entitlement architecture and premium gating

No real billing was added: no StoreKit, no Google Play Billing, no RevenueCat, no Dodo, no backend, no new dependencies.

**One entitlement, one authority**

```
domain/entitlement/            pure: no React, Expo or billing types
  subscription.ts              "premium", $7.99/month, 10 subscription states, VerifiedSubscription, EntitlementCache
  policy.ts                    the only PREMIUM/FREE decision (store answer or offline cache)
  features.ts                  PremiumFeature list + PremiumRequiredError
  palette.ts                   FREE colors: template default + the spec's 8 presets
  cache-codec.ts               strict cache parsing (malformed → no cache)
services/entitlement/
  store-provider.ts            StoreProvider interface + UnavailableStoreProvider (release builds)
  fake-store.ts                development/test only (see "Fake store" below)
  store-factory.ts             __DEV__ → fake store; release → unavailable (every user FREE)
  entitlement-service.ts       EntitlementService: the only entitlement authority
  premium-gate.ts              PremiumGate.require(feature): the check every premium service calls
  paywall.ts                   PaywallCoordinator: remembers the refused action, resumes it after subscribing
  entitlement.tsx              React provider (display snapshot, paywall routing, refresh on launch/foreground)
services/premium/              PremiumTools (Job Match; Writing Coach and Tailoring entry points), CustomizationService
services/preview/              PreviewService (decides the watermark)
services/export/               ExportService (the only export/share boundary) + expo platform
services/storage/entitlement-cache-kv.ts   device cache file
```

**Subscription states**

| Grants premium | Never grants premium |
|---|---|
| `active`, `grace_period`, but only before their expiry | `billing_retry`, `account_hold`, `paused`, `pending` (Ask to Buy), `expired`, `refunded`, `none`, `unknown` |

A premium state that has no expiry, or whose expiry has passed, is FREE.

**Decision rule** (`policy.ts`)

The store is asked first. The cache is used only if the store cannot answer: offline, no store in this build, or a verification error. Cached premium counts only when **all** of these hold:
- the cache came from the current provider;
- the cached state is `active` or `grace_period`;
- the device clock has not moved backwards;
- now < **MIN(subscriptionExpiry, lastVerifiedAt + 7 days)**.

**The cache is a cache, not a grant**
- It stores provider, product, state, expiry, `lastVerifiedAt` (store time) and a clock high-water mark. There is **no premium boolean**.
- It is overwritten by every store answer, so a refund seen online also ends offline premium.
- It can be cleared (`invalidateCache()`).
- It is parsed strictly: anything malformed or tampered with counts as no cache (FREE).
- Location: its own key-value file, `my-resume-entitlement.db`, not a table in the resume database. Subscription state never mixes with user data or backups, can be wiped on its own, and the step 2 schema did not have to change.

**Clock rollback**
- If the device time is earlier than the high-water mark, cached premium is refused until the store verifies again.
- A store answer resets the mark to the later of device time and store time. A device clock that has been moved back therefore still can't extend the cache after the next verification.

**Gating in the service layer**

| Feature | Enforced in |
|---|---|
| PDF / DOCX export | `ExportService`: premium check **before generation** and **again immediately before sharing**. A denied or failed export deletes its file immediately. Shared files stay in the private `exports/` cache folder until the next launch clears it (the receiving app may still be reading them). Callers get no file path |
| Image export | `ExportService.exportImage`: premium check. The feature itself arrives in step 6 |
| Clean preview | `PreviewService.render`: FREE is always watermarked |
| Job Match | `PremiumTools.jobMatch` |
| Writing Coach / Tailoring | `PremiumTools.writingCoach` / `.tailoring`: premium check. The features arrive in steps 8 and 10 |
| Custom accent | `CustomizationService.setAccent`. The screens' store API no longer accepts a raw accent; template changes reset to the template's default (free) color |

**Callers cannot supply a decision**
- Premium operations take the resume only (tested by function arity).
- Extra "premium: true" arguments, or premium-looking fields on the resume, are ignored (tested).

**Fake store** (development and tests only)
- It can simulate every state, offline, pending/approval, refunds, cancelled/failed purchases, and a store clock separate from the device clock.
- It is `require`d only inside `if (__DEV__)`. Verified in real bundles via source maps:

| Bundle | Fake store present? |
|---|---|
| iOS release | no |
| Android release | no |
| Android development | yes |

- Release builds use `UnavailableStoreProvider`, so every user stays FREE until real billing is approved.
- The Step 1 rule that unlocked exports in debug builds was **removed**. Debug builds start FREE and subscribe through the fake store.

**Paywall** (existing screen layout kept)
- The copy now reads **"Premium — $7.99/month"**, with the premium feature list and an auto-renew/cancel line.
- The flow:
  1. a premium action is refused by its service;
  2. `PaywallCoordinator.request()` remembers the action and opens the paywall;
  3. the user subscribes through the fake store;
  4. the store verifies again;
  5. the paywall closes and the remembered action runs again through **its own checks**.
- Cancel keeps the action pending until "Not now". A pending purchase does not resume. Restore can resume.

**Screen changes** (wiring and copy only, no redesign)
- Preview:
  - export buttons always call `ExportService`;
  - the watermark comes from `PreviewService`;
  - colors go through `setAccent`;
  - the color row now shows the spec palette (template default + 8 presets) instead of the prototype's 8 colors. That row is what the free/premium color rule applies to.
- Job Match calls `PremiumTools`.
- The paywall copy changed, and its title in the navigation bar is now "Premium".
- The layout provider order is now Database → Entitlement → Resume store.

**Fixed along the way**
- `File.move` returns a Promise and the prototype never awaited it, so a PDF could be shared before the move finished. It is now awaited.

**Tests: 162 in total** (83 new)
- 70 of the earlier tests are unchanged.
- 9 were **ported, not deleted**, because their APIs let the caller pass the decision, which Step 3 forbids:
  - the 7 `resolveExportAccess` cases now run through `EntitlementService`, with the same intent per case. One case is deliberately inverted: debug builds no longer auto-unlock;
  - the 2 export-record cases now run through `ExportService`.

| Area | Tests |
|---|---|
| Policy | all 10 states (store and cache); expiry; missing expiry; 7-day boundary (−1 ms / exactly 7 days); expiry before the boundary; clock rollback; provider mismatch; cache contents; strict codec; injected `premium: true` |
| Service with fake store | every state; cancel at period end; renewal; reinstall with an empty cache (online and offline); online/offline; stale cache; offline FREE; expiry online and offline; refund online and offline; grace/retry/hold/pause; clock rollback forcing store verification; cache invalidation; corrupt/failing cache; purchase success/pending/cancel/fail/offline/unverified; restore; release provider |
| Gating | every premium feature for FREE vs PREMIUM; Job Match; Coach/Tailoring entry points; custom accent vs free palette; clean vs watermarked preview; FREE users can still use all templates |
| Export gate | FREE refused before generation (PDF, DOCX, image); two checks per export; premium lost between generate and share → not shared + discarded; share failure → discarded; offline export inside/outside the 7-day window |
| Caller-supplied decisions | function arity; extra premium arguments; premium-looking resume fields |
| Paywall | Export PDF → refused → paywall → fake subscription → export resumes with fresh checks (3 verifications); cancel; pending; restore; resumed action refused again if premium was lost |
| Architecture | no billing SDK declared or imported; fake store only through the dev branch; screens cannot import the renderer, raw export platform, storage library, fake store, entitlement internals or `matchJob`; no persisted premium boolean. Each guard was broken on purpose to confirm it fails |

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator |
|---|---|
| Policy, service, gates, export gate, paywall flow and resume-after-purchase, all with the fake store and controlled clocks | The paywall screen, navigation back, and resuming the export on a real device |
| Fake store excluded from iOS and Android release bundles; included in the dev bundle (source maps) | Real Apple/Google purchase, restore, refunds and grace periods (real billing is a later step) |
| Clean install, typecheck, lint, all tests, iOS and Android bundles; no billing packages installed | The device cache file (`expo-sqlite/kv-store`) and the export-folder purge on launch |

### 19.4 Step 4 record: secure export service (PDF, DOCX)

Image export was **not** implemented (step 6). No billing, AI, backend or UI redesign. The only dependency change is `jszip` as a dev dependency, used by tests to inspect DOCX files. It is the version already installed with `docx`.

**The boundary**

```
screens ──► ExportService (services/export/export-service.ts)   entitlement checks, handles, records
              └─► ExportPlatform: file-export-platform.ts        rendering, files, cleanup (no Expo imports)
                    └─► expo-export-platform.ts                  expo-print, expo-sharing, expo-file-system adapters
```

Enforced by guard tests:
- only `file-export-platform.ts` imports the DOCX generator or renders in PDF mode;
- only `expo-export-platform.ts` imports `expo-print`, `expo-sharing` or `expo-file-system`;
- screens import neither, and never the renderer;
- `ExportService` never reads export history.

Each guard was broken on purpose to confirm it fails.

**Lifecycle**

| Call | What happens |
|---|---|
| `prepare(resume, {format, paper})` | premium check #1 → generate → returns an **opaque handle** |
| `share(handle)` | validates the handle → premium check #2 → share → handle consumed |
| `discard(handle)` / `discardAll()` | deletes the artifact(s) |
| `exportPdf(resume, paper = 'letter')` / `exportDocx(resume)` | prepare + share in one call; what screens use |

**Handles**
- A handle is a frozen `{ id, format }`: **no path**.
- It is valid only in the service instance that issued it. Validity is tracked by object identity, so a copied or forged handle with the same id is rejected.
- It works **once**, expires after 5 minutes, and is invalid after discard or after premium is lost, even if premium comes back.
- After an app restart, old handles are invalid and the launch purge deletes their files.

**Any denial or failure deletes the artifact immediately**
- first or second check refused;
- handle expired;
- app not in the foreground when sharing;
- share failed or the share sheet is unavailable;
- the user dismissed the share;
- renderer or DOCX failure;
- file-system error or a full disk (partial files included).

A shared file stays in the private `exports/<artifact id>/` folder only until the next launch purge. The receiving app may still be reading it.

**Also enforced**
- **One export at a time.** A duplicate attempt gets `ExportInProgressError`.
- **Records.** Every attempt appends metadata: `succeeded`, `failed` (including cancel and interruption) or `denied`, with the decision reason. Records are never read to authorize anything.
- **Paywall.** A refusal at either check throws `PremiumRequiredError`, which the preview screen hands to the existing `PaywallCoordinator`. After a verified subscription the whole export runs again with fresh checks.

**PDF**
- Same renderer as the preview, in PDF mode, **never watermarked**.
- `paper` added to the renderer:
  - `letter`: `@page size: letter`, printed at 612×792 pt;
  - `a4`: `@page size: A4`, printed at 595×842 pt;
  - 0.75 in margins.
- Checked outside the suite: headless Chromium printing the exact export HTML gives MediaBox 612×792 (Letter) and 595×842 (A4), with no watermark element.
- **Screens currently export Letter** (the default). A paper-size picker is a UI addition and belongs with Settings (step 12). The service and tests cover both sizes.

**DOCX**
- The existing Word generator, unchanged, verified by opening the actual zip:
  - `[Content_Types].xml`, `word/document.xml` and `docProps/core.xml` are present;
  - the resume content is in the document;
  - the template accent color is on the headings;
  - the title is "<Name> — <Template name>";
  - the creator is "My Resume";
  - no "PREVIEW" text appears anywhere.
- The Word generator's page size is not changed (no new document features).

**Tests: 202 total** (40 new); all 162 earlier tests pass unchanged.

| Area | Covered |
|---|---|
| Entitlement | FREE rejection before generation; PREMIUM success; two checks per export; entitlement lost between checks (refund); expiry between generate and share; export history never read as proof |
| Paywall | refused export → existing paywall flow → verified subscription → export resumes |
| PDF | Letter / A4 dimensions and page rule; default Letter; no watermark; template marks and accent preserved; private file path; print temp file moved, not copied; purge |
| DOCX | valid zip; content; template/accent mapping; product metadata; no watermark |
| Handles | opaque (no path); single use; invalid after discard; invalid after entitlement loss; lifetime expiry; forged or copied handles; other service instance; `discardAll` |
| Failures | renderer failure; DOCX generation failure; file-system failure (temp file removed); full disk (partial file removed); share failure or unavailable; cancelled share; duplicate export; app backgrounded; app terminated (simulated: new process, old handle invalid, purge) |
| Bypass attempts | "premium: true" arguments; premium-looking resume fields; old handle reuse; share after expiry; running the paywall's pending action without subscribing; direct renderer/DOCX/print imports from a screen (guards) |

A mutation check was also run: removing the second entitlement check, or making discard do nothing, makes 9 tests fail each.

**Observed, not changed (step 5 scope).** In PDF mode the Boardroom and Foreman quarter-circle mark sits at the top right of the content area and can overlap the end of the contact line. The web original placed it in the page margin. This belongs to the template-parity pass in step 5 ("do not redesign templates" in step 4).

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator |
|---|---|
| Export service, handles, both checks, failures and cleanup, with the real renderer and real DOCX generator over an in-memory file system and fake print/share adapters | `expo-print` output on iOS and Android (margins, fonts, page breaks) |
| Letter and A4 page sizes of the export HTML via Chromium | `expo-file-system` folder create/delete and move; the launch purge |
| DOCX structure and content, by unzipping the generated file | `expo-sharing` on both platforms (it cannot report completed vs. dismissed; recorded as shared) |
| iOS and Android release bundles: export modules present, fake store and billing SDKs absent | Background interruption and app kill during a real export |

### 19.5 Step 5 record: FREE preview watermark, preview/PDF parity, mark overlap

**Scope (owner, narrowed).** Only three things: the FREE preview watermark, rendering parity between the preview and the PDF, and the Boardroom/Foreman quarter-circle overlap. No image export, paper-picker UI, billing, AI, backend, template redesign or settings work.

**1. Watermark (FREE preview only)**

- A repeating, diagonal "PREVIEW" tile (SVG data URI, −30°, opacity 0.11, 300×190 px tile) on an overlay `div.watermark` that covers the whole sheet (`inset: 0`), sits above the content (`z-index` 5 over the content's 1) and ignores touches.
- `PreviewService` decides it from `EntitlementService` alone (`watermark = !premium`). Screens pass only the resume, and extra arguments or premium-looking fields are ignored.
- The renderer honours `watermark` **only in preview mode**. A PDF is never watermarked, even when asked, and DOCX has no watermark path at all.
- The watermark is not stored in the resume. Rendering does not modify the resume, and the content block is byte-identical with and without it.
- Text selection is disabled in the watermarked preview. Screenshots of the screen cannot be prevented (decision recorded in revision 3); the watermark is what makes them unusable.

**2. One rendering path, same layout**

- The output is split into three marked blocks: `content` (resume HTML), `shared` CSS (typography, colors, spacing, sections, marks) and `geometry` CSS (page framing). The first two are **byte-identical** between preview and PDF for all 12 templates and both paper sizes. Only `geometry` differs: the preview is a sheet of paper width with 0.75 in padding; the PDF uses `@page { size; margin: 0.75in }`.
- Data is normalised before rendering, so malformed data never throws.
- Verified in a real engine: every element inside the content has the same position and size in the preview and in print layout (Letter exact; A4 within 1 px because the A4 content box is 649.7 px).

**3. Decorative marks (Boardroom, Foreman, and the top-rule templates)**

- **Cause.** In PDF mode the marks were drawn inside the content box over the header, so the quarter-circle covered the end of the contact line (Boardroom) and `eleanorvance.com` (Foreman), and the Editorial rule touched the name. The web original drew them in the paper corner, but print engines do not paint in the page margins (Chromium clips there), and `expo-print` margins are set for the whole document.
- **Fix.** The marks stay the same size, shape, color and corner, but are now drawn **inside a reserved band of the content box**, identically in the preview and the PDF.
  - The header of a quarter-circle template keeps 104 px free on both sides (the header is centred) and is at least 96 px tall.
  - Top-rule templates keep 24 px above the header.
- **Visible change (intentional).** The quarter-circle now sits at the top-right of the content area instead of the paper corner. This was the only way to get the same result in the preview and in every print engine. Templates were not otherwise redesigned.

**Tests: 221 in total** (202 before; +13 `render-parity.test.ts`, +6 `render-layout.test.ts`)

| Area | Covered |
|---|---|
| Parity (strings) | content and shared CSS identical for 12 templates × 2 papers; only geometry differs; `MARGIN_PT = 0.75 × 72`; section order |
| Parity (layout, Chromium) | element-by-element geometry equal in preview and print layout, 12 templates × Letter/A4 |
| Overlap (layout, Chromium) | no text rectangle intersects a mark, for all 6 mark templates, preview and PDF, sample and long data; the quarter-circle keeps its 96 px size in the top-right corner |
| Long data | long name, email, website and company names: no text outside the page and no horizontal scroll, all 12 templates |
| Watermark | FREE on, PREMIUM off; the PDF is never watermarked; screens cannot remove it; the resume is not mutated; pixel check: the FREE screenshot differs from PREMIUM in **every** 320×210 block (full coverage), and no pixel is darkened by more than 40/255 (readability) |
| Multi-page | a long resume prints on ≥ 2 pages, and every page is 612×792 pt (Letter) or 595×842 pt (A4) with no watermark |
| Edge cases | malformed data, empty resume, unknown template, invalid color |

The layout tests use `playwright-core` (new **dev-only** dependency, exact version 1.56.1, no browser download) with the preinstalled Chromium, and skip when Chromium is not present (`CHROMIUM_PATH` overrides the path).

**Mutation checks (each reverted after the run)**

| Mutation | Result |
|---|---|
| Remove the quarter-circle header reservation | 2 tests fail (string + real-layout overlap) |
| Remove the top-rule header padding | 2 tests fail |
| Let PDF mode honour `watermark` | 2 tests fail |
| Watermark `no-repeat` | 2 tests fail (structure + pixel coverage) |
| Watermark opacity 0.6 | 2 tests fail (opacity bound + pixel darkening) |
| `PreviewService` never watermarks | 4 tests fail |

**Architecture guard change.** The "no network URLs in source" guard now allows exactly one string, the SVG namespace `xmlns='http://www.w3.org/2000/svg'` used by the watermark tile. It is an identifier, not a request. A mutation check confirmed that any other `http(s)://` URL still fails the guard.

**Validation:** clean install (`npm ci`) ✅, `tsc --noEmit` ✅, `expo lint` ✅, 221/221 tests ✅. iOS and Android release bundles ✅: fake store absent, billing SDKs absent, no AI SDKs, no `playwright-core`.

**Known limits and leftovers**

- The preview is one continuous sheet. It does not show where the PDF will break pages. Page breaks are verified only in the PDF (Chromium).
- Fonts are still the system serif/sans stacks. The spec fonts are not bundled yet (moved to step 12), so the iOS, Android and Chromium glyph metrics differ slightly. Parity here means the same engine inputs, not identical pixels across platforms.
- The paper picker UI is not built (Letter is the default; A4 is supported by the renderer and `ExportService`).

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator |
|---|---|
| Renderer output, parity and watermark decisions (unit tests) | The watermark in the iOS `WKWebView` and the Android WebView (SVG data-URI backgrounds, opacity) |
| Layout, overlap, overflow, watermark coverage and multi-page PDF in Chromium | `expo-print` page breaks and mark position on iOS (WebKit) and Android |
| Release bundles for both platforms | Pinch-zoom and scaling of the preview sheet on small and large phones |

### 19.6 Step 6 record: image export (PNG)

**Scope.** Premium image export only. No import, Writing Coach, Job Match, tailoring, billing, settings, paper picker, custom colors, fonts or template changes.

**Format and method (as the plan specifies, §11).**
- The format is **PNG, one image per page**. No other format was added.
- Each page is rasterized from **the same PDF as the PDF export**:
  - resume data → `renderResumeHtml` (PDF mode, never watermarked) → `expo-print` → temporary PDF;
  - → pdf.js in a hidden, offline WebView → one PNG per page.
- There is no separate image renderer: image, PDF and preview share one rendering path.
- The `react-native-view-shot` fallback was not needed.

**How it works**

| Part | What it does |
|---|---|
| `ExportService.exportImage(resume, paper)` | Format `png`, gated on `export.image`, using the same boundary as PDF and DOCX. Check #1 runs before generation, check #2 before sharing, and a further check before every extra page's share sheet |
| `file-export-platform.generatePng` | Prints through the same `printPdf` step as `generatePdf`. It reads the temporary PDF, rasterizes it and writes `exports/<id>/<Name>.png` (or `<Name>_page-N.png`). It then always deletes the temporary PDF, which never becomes an artifact. Any failure deletes the artifact folder |
| `rasterizer/rasterizer-bridge.ts` | Job protocol with the WebView: one job at a time, 60 s timeout. Validates every message: job id, page order, page count, size caps and the PNG signature |
| `rasterizer/rasterizer-page.ts` | The pdf.js page, with CSP `default-src 'none'; connect-src 'none'; worker-src 'none'` and inline scripts only. Caps: 3× (216 dpi), longest side ≤ 2400 px, ≤ 10 pages |
| `rasterizer/RasterizerHost.tsx` | Hidden 2×2 WebView, mounted by the root layout only while a job runs (no memory kept between exports). JavaScript on; no navigation, file access, cache or remote loads |
| Sharing | Through the Step 4 share boundary: one share sheet per page, in order (`expo-sharing` shares one file at a time). Cancelling stops the remaining pages and deletes the files |
| Records | `export_records` schema **v2** rebuilds the table to accept `png`. All rows and indexes are kept, and v1 → v2 is tested |

**pdf.js packaging**

- `pdfjs-dist` 6.3.289 is pinned exactly (Apache-2.0).
- On install, `scripts/pdfjs-source.mjs` (postinstall) turns its legacy build into `pdfjs-source.generated.ts`:
  - the main module's exports become a global;
  - the worker runs on the page's main thread;
  - non-ASCII characters are escaped;
  - the file is gitignored, and the app loads it lazily.
- About **+1.85 MB** per bundle (iOS 2.8 → 4.7 MB, Android 3.1 → 5.0 MB). Without the ASCII escaping, Hermes would have stored it as UTF-16 (+3.5 MB).
- `pdfjs-dist` also installs `@napi-rs/canvas`, an optional dependency for Node. It stays in `node_modules` and is **not** in the app bundles (verified).

**Security (the Step 4 rules, applied to images)**

- Opaque, frozen, single-use handles with no path.
- A handle is invalid after:
  - its lifetime expires;
  - discard;
  - entitlement loss (even if premium returns);
  - forging or copying;
  - use from another service instance;
  - an app restart.
- The launch purge deletes all pages.
- Every failure leaves no artifact: print, rasterizer (including a missing host), reading the PDF, writing a page (partial file), share failure, cancellation, backgrounding.
- A refused image export opens the existing paywall, which resumes the export after a verified subscription.
- The generated pdf.js file is the only vendored code exempt from the "no `fetch(`" source guard. In its place:
  - an integrity test (the file equals the generator's output from the installed package);
  - an ASCII test;
  - the CSP;
  - a Chromium test showing that the page's own `fetch` is blocked and that no request leaves the engine during image export.

**Tests: 269** (221 before; +23 in `export-service.test.ts`, +20 in `rasterizer.test.ts`, +1 migration, +4 architecture guards; the existing gating test now exercises image export instead of "not available yet")

| Area | Covered |
|---|---|
| Gating | FREE refused before print/rasterize (denial recorded, paywall feature `export.image`); PREMIUM generates; check count 2 (one page) or 3 (two pages); entitlement loss before share and between pages; paywall resume |
| Rendering path | the image's print call is identical to the PDF export's, equal to `renderResumeHtml(mode 'pdf')`; Letter 612×792 / A4 595×842 pt; no watermark; template, accent and content |
| Handles and failures | as listed above |
| Bridge | ready handshake; malformed, foreign and stale messages ignored; wrong order, non-PNG, oversized, over-count or fractional pages fail the job; count mismatch, page error, timeout, lost host, busy; a failing host never leaves a job stuck (bug found and fixed while writing these tests) |
| End to end (Chromium standing in for `expo-print` and the WebView) | real `ExportService` → shared renderer → PDF → bundled pdf.js → PNG:<br>• one 1836×2376 PNG per PDF page;<br>• Boardroom and Foreman quarter-circle pixels in the accent color;<br>• Editorial rule in its accent;<br>• the PDF text has the name, contact and all sections in order, and no "PREVIEW";<br>• the empty part of the last page is pure white;<br>• positive control: the same check detects a watermark;<br>• A4 capped at 2400 px;<br>• page cap enforced;<br>• no network |
| Architecture | only `rasterizer-page` loads the pdf.js source; only the export platform, its Expo adapter and the host reach the bridge; only the root layout mounts the host; only `ExportService` calls `generatePng`; screens cannot import anything under `services/export/rasterizer`; `pdfjs-dist` pinned; generated file not committed |

**Mutation checks (each reverted):**

| Mutation | Tests that fail |
|---|---|
| Remove the second check | 10 |
| Ignore the per-page guard | 2 |
| Skip check #1 for PNG | 6 |
| Rasterize the watermarked preview instead of the PDF HTML | 4 |
| No cleanup on image failure | 1 |
| Keep the temporary PDF | 5 |
| Accept non-PNG pages | 1 |
| Allow network in the page CSP | 2 |
| Remove the page cap | 1 |

**Validation:** clean install (the postinstall generates the pdf.js source) ✅, `tsc` ✅, `expo lint` ✅, 269/269 ✅. iOS and Android release bundles ✅: fake store, billing SDKs, AI SDKs, `playwright-core`, `pdfjs-dist`'s Node files and `@napi-rs/canvas` all absent.

**Known limits**

- **Multi-page share (known limitation; spike done, see below).** A resume of N pages opens N share sheets, one per page. Sharing them in one sheet is **not possible with the current stack** without a native change.
- **pdf.js worker on the main thread.** pdf.js runs its worker code on the WebView's main thread (no separate worker file). This is fine for 1–3 pages, but its speed on low-end Android is not measured.
- **Fonts.** The image uses the fonts embedded in the `expo-print` PDF, so it matches that platform's PDF, not necessarily another platform's.

**Spike: multi-file sharing with the existing stack (result: not possible without native code)**

I checked the installed packages, including their native sources, not the documentation:

| API (installed version) | Contract | Multiple files? |
|---|---|---|
| `expo-sharing` 57.0.22 `shareAsync(url: string, options)` | iOS: `UIActivityViewController(activityItems: [url])`, one item. Android: `Intent.ACTION_SEND` with one `EXTRA_STREAM` | **No** (not `ACTION_SEND_MULTIPLE`; there is no array parameter) |
| `expo-sharing` `getSharedPayloads` / `getResolvedSharedPayloadsAsync` / `useIncomingShare` | Content shared **into** the app by other apps | Not outbound sharing |
| React Native `Share.share({ url, message })` | iOS: one `url`. Android: `EXTRA_TEXT` only (text, no files) | **No** (Android cannot share files at all) |
| `expo-print` | `printAsync` (printer), `printToFileAsync` (one PDF) | No sharing |
| `expo-file-system` 57 | `Directory.pickDirectoryAsync`, `File.pickFileAsync`: pick a folder or file | Saves to a folder; this is not a share sheet |
| Web Share API inside `react-native-webview` | Android System WebView does not implement `navigator.share` | Not cross-platform |

Rejected as fragile or wrong:
- Sharing the export **folder** URL (most targets cannot receive a directory, and Android `ACTION_SEND` needs a file content URI).
- Sequencing the share sheets faster.
- Web Share in the WebView.

**What a later fix needs (not implemented; owner decision):**
1. **A native multi-file share call.** iOS: `UIActivityViewController` with several file URLs. Android: `ACTION_SEND_MULTIPLE` with an `ArrayList<Uri>` in `EXTRA_STREAM`, `ClipData`, read-URI grants through the existing FileProvider. Two ways to add it:
   - a small **local Expo module** in this repo (no third-party code, the smallest surface);
   - a maintained library that already accepts several URLs.
   Either needs a new development build. It would sit behind the existing `ShareAdapter`, as a `share(uris[])` variant, so `ExportService`, the handles, and the entitlement checks (check #2 before the one sheet) stay as they are.
2. **Or a product change with no native code**, still within the current stack:
   - one combined image (all pages stacked in one tall PNG, drawn by the same pdf.js page);
   - "save all pages to a folder" with `Directory.pickDirectoryAsync` (a save, not a share, and iOS behaviour needs device checks);
   - pointing multi-page users to the PDF, which already carries every page in one file.
   Each of these changes the plan's "one PNG per page, shared together" and needs owner approval.

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator |
|---|---|
| The whole pipeline with real pdf.js in Chromium, and the export service with in-memory doubles | pdf.js inside `WKWebView` (iOS) and Android System WebView: inline module scripts, CSP, `injectJavaScript`, `postMessage` message sizes |
| Release bundles for both platforms | Reading the `expo-print` temporary PDF with `File.base64()`; writing PNGs with `expo-file-system` |
| | Share sheets for `image/png` (one per page) on both platforms; memory and time on low-end Android |

### 19.7 Step 7 record: editor parity and Resume Score with jump-to-section

**Scope source.** No `PRODUCT_CONSTITUTION`, `MVP_SCOPE` (for this product) or `TECHNICAL_IMPLEMENTATION_PLAN` exists in either repository. The step comes from this plan (§19 row 7, §1 items #13–21 and #25, §18 editor row) and from the web source it references (`ResumeEditor.tsx`, `ResumeTools.tsx`, `resume-score.ts`).

**Owner decisions (approved before implementation)**
1. Web labels where they are part of parity. No redesign, and the mobile additions are kept: resume title, reorder, date and location placeholders, entry counts, subtitles.
2. Stable keys are UI-only. No ids in `ResumeData`, no migration, and no schema or persistence change (schema stays v2).
3. "Improve" stays in Tools → Check and returns to the editor with a route parameter. There is no new screen.
4. `Collapsible` can be controlled optionally (`open` / `onOpenChange`), and behaves as before without them.
5. The web empty-list hint is shown in string lists.
6. Scoring rules are unchanged, and the existing null-safety guard stays.
7. No component-testing library: pure-logic tests, architecture guards and the existing suite.

**What changed**

| Area | Change |
|---|---|
| `domain/resume/sections.ts` (new) | The seven editor sections in order, web section titles, and `parseSectionParam`, which accepts exactly those seven ids and returns null for anything else (arrays, `__proto__`, case or spacing variants, non-strings) |
| `domain/check/resume-score.ts` | Type only: the warning's `section` now uses the shared section type. **No rule changed**; a one-off cross-check against the web file returned identical output on the golden inputs |
| `features/check/CheckTool.tsx` | Web order and headings: "Resume Score" x / 100, categories, "What is working" (only when present), "Needs attention" with an **Improve** link per warning, then the disclaimer "Designed for reliable parsing with standard headings and readable text. No ATS guarantee is implied." |
| `features/check/improve-link.ts` (new) | Check copy and `improveHref(resumeId, section, jump)` |
| `features/tools/ToolsScreen.tsx` | Improve → `router.dismissTo(editor, { section, jump })`: a stack pop back to the editor underneath (Expo Router 57's `dismissTo` = `POP_TO`; if the editor is not in the stack it replaces the screen) |
| `features/editor/EditorScreen.tsx` | Web labels (from `editor-copy.ts`); stable keys for the four entry lists; anchors per section. A new `jump` token opens the target section: Personal or Summary, or every entry of a list section. The open state is set during render (React's pattern for new props), and an effect then scrolls to the section header |
| `features/editor/editor-copy.ts` (new) | Labels, placeholders and add-button text from the web editor |
| `ui/entry-keys.ts` (new) | `applyListOp` / `applyKeyOp` (the same operation on data and keys), `syncKeys` (deterministic positional fill if a list changes from outside), and `useStableKeys` |
| `ui/components.tsx` | `Collapsible`: optional controlled `open`, with internal state kept in step with every toggle. `StringListEditor`: stable row keys and `EMPTY_LIST_HINT` |

**Tests: 298** (269 before, all still passing; +27 `editor.test.ts`, +2 architecture)

| Area | Covered |
|---|---|
| Sections | seven ids in order, web titles, `parseSectionParam` accepts all seven and rejects 20 other values |
| Score (golden) | sample (100, five strengths, no warnings), empty (15, five warnings with messages and sections), partial (48, six warnings including `short-bullets` and `action-verbs`); every warning maps to a real section; the null-safety guard is pinned |
| Navigation | `improveHref` round-trips through `parseSectionParam`; a new jump token each time; Tools uses `dismissTo`; the editor only uses the parsed section |
| Stable keys | add, delete first, delete middle, reorder up and down, and a mixed sequence: a key never points at a different entry, a surviving entry keeps its key, keys are unique, one per entry. Negative control: index keys fail the same check. The editor and the list editor apply each operation to keys and data together, and no `key={index}` remains. `ResumeData` entries have no id field |
| Copy parity | editor copy equals the web strings; the resume title is the only non-web field label; mobile additions still present; empty hint; Check copy and web order |
| Collapsible | uncontrolled by default; `open` overrides; internal state follows toggles |
| Architecture | `features/editor` and `features/check` import no entitlement, premium, paywall or export code (both stay FREE); the score imports only domain code |

**Mutation checks (each reverted)**

| Mutation | Tests that fail |
|---|---|
| Index keys in `applyKeyOp` | 7 |
| Fresh keys on every change | 7 |
| `key={index}` in the editor | 2 |
| `parseSectionParam` accepting any string | 1 |
| A scoring weight changed | 1 |
| Empty hint removed | 1 |
| Improve not calling back | 1 |
| Collapsible ignoring `open` | 1 |
| List editor not updating keys on delete | 1 |
| Null-safety guard removed | 1 (the source pin) |

The null-safety mutant has no observable behavior: `String.split` always returns at least one element, and `noUncheckedIndexedAccess` is off. It is therefore pinned at source level only.

**Validation:** clean install ✅, `tsc` ✅, `expo lint` ✅, 298/298 ✅. iOS and Android release bundles ✅: fake store, billing SDKs, AI SDKs, `playwright-core` and `@napi-rs` all absent. No dependency changes.

**Limits**

- **UI checked through source guards.** There is no component renderer in the test setup (owner decision), so the UI wiring is checked by source-level guards. The actual open, scroll and focus behavior is part of the device editor pass.
- **Scroll position.** The target is taken from the section header's layout. With very long open sections above it, the first layout pass may be off by a frame, which is why the scroll waits 50 ms, as the web version does. Only a device can confirm this.

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator (NOT RUN) |
|---|---|
| Section parsing, golden scores, key stability, copy parity, FREE boundary, bundles | Improve → editor → section opens → scroll lands on the header (iOS and Android) |
| | Keyboard, focus and input state after delete or reorder with stable keys |
| | `dismissTo` behavior when the editor is not in the stack (deep link into Tools) |

### 19.8 Step 8 record: Writing Coach (PREMIUM)

**Scope (plan §3, §1 #22; owner decisions).**
- Deterministic rules with reasons and a few safe, user-triggered fixes, on the five fields that had "Improve with AI" in the web editor: tagline, experience summary, experience bullets, project description and project bullets.
- No AI and no free-form rewriting.
- No summary bullets, whole-resume review, spelling checker or new dependency.

**Architecture: Editor → `PremiumTools` → `domain/coach`**

| Part | Role |
|---|---|
| `domain/coach/types.ts` | Fields, categories, findings, and the fix kinds: `auto`, `preview`, and `choices` (no default). Limits: 6,000 characters of text; 300 characters of context |
| `domain/coach/wordlists.ts` | Fixed English lists: weak openers with neutral choices, fillers, buzzwords, wordy phrases, passive participles (honours excluded), verb tenses, outcome and quantity words. `COACH_ALLOWED_WORDS` (the only words a fix may add) and `ELEVATED_CLAIM_WORDS` (never added) |
| `domain/coach/rules.ts` | 15 rule checks covering the plan's 10 rules. Conservative: a rule fires only on listed patterns and returns nothing when unsure |
| `domain/coach/grounding.ts` | The no-fact guard. A fix may not add a number, `% $ € £ + # @`, or any word that is neither in the source nor in `COACH_ALLOWED_WORDS`. It is stricter than the web's check (the web allowed "led" and "managed") |
| `domain/coach/coach.ts` | `analyzeText`. `applyFix` does three things: it binds the finding to the exact text (`textKey`), requires the finding to be reproduced by a fresh analysis (so forged or altered findings are refused), and changes only the finding's span, then runs the grounding guard. Any failure means the text is not changed |
| `services/premium/premium-tools.ts` | `writingCoach` checks `coach` before analysing, so FREE users get nothing about their text. `applyCoachFix` checks again before applying |
| `features/coach/CoachEntry.tsx` | "Coach" (PREMIUM) or "Coach 🔒" (FREE, which opens the existing paywall and resumes afterwards) under each of the five fields. The inline panel shows findings grouped under the web's action names, with previews, neutral choices and Apply. If the text changes, it asks to refresh. It closes if premium lapses; applied text stays the user's |
| `ui/components.tsx` | `StringListEditor` gets an optional per-row `renderAction` (as in the web editor) |

The siblings context is read-only by construction: rules receive only each other bullet's first word and whether it ends with a period, and a fix returns only the chosen text.

**Rules**

| Plan rule | Rule id(s) | Fix | Conservative limits |
|---|---|---|---|
| Weak openers | `weak-opener` | choices: neutral only ("Helped with" → Supported / Contributed to / Assisted with) | bullets only; skipped when a gerund follows ("Responsible for managing…") |
| Filler words | `filler`, `buzzword` | filler: preview (removal); buzzword: advice | not acronyms, hyphenated words, or when nothing follows |
| Passive voice | `passive` | advice | listed participles only; honours ("was awarded", "was promoted") excluded |
| First-person pronouns | `first-person` | preview only for "I" + a known past verb; otherwise advice | "I/O", "ME", "I'm" not flagged |
| Bullets over 32 words | `long-bullet` | advice | bullets only |
| No measurable result | `measurable` | **none**: only "Can you add a measurable result here?" | experience bullets that *start* with an outcome verb and contain no number, quantity word or fraction |
| Mechanics | `spacing`, `capitalization`, `final-period`, `repeated-word`, `a-an` | auto | capitalization only for known English first words (not "npm", "iOS", "kubectl"); final period only when all other bullets agree; "that that" and names allowed; a/an skips acronyms, "one", "eu", "hour", "x-ray" and "Plan A" |
| Tense consistency | `tense` | advice | only when every sibling's tense is certain and uniform; "Lead" (may be a noun) excluded |
| Repeated opening verbs | `repeated-opener` | advice | third bullet with the same known verb |
| Wordy phrases | `wordy` | preview | fixed table; replacements are function words |

**Result: all 10 plan rules work (15 rule checks). None was disabled.** Three were narrowed after the corpus review:
- **measurable:** flagged "…a loop that *reduced*…" (subordinate clause) and "by *a third*" (fraction). Now it fires only when the bullet starts with an outcome verb, and fractions count as quantities.
- **repeated-word:** missed "Led **the the**", because the first word of each pair was consumed. Fixed with a lookahead.
- **Grounding number parser:** read "v2.1." as a new number and refused a harmless final period. Numbers now end with a digit. The guard stays strict.

**Corpus** (`__tests__/fixtures/coach-corpus.ts`)
- **Strong:** 31 well-written texts, including the sample resume and borderline wording such as "Was awarded…", "I/O-bound", "npm package…", "an hour-long", "a unique", "an MBA", "by a third". **0 findings** (2 false positives before the fixes above).
- **Weak:** 23 typical draft texts. **35 findings before; 11 after** applying every safe fix. The 11 left are advice only: measurable ×2, passive ×1, first-person ×2, buzzword ×3, long-bullet ×1, tense ×1, repeated-opener ×1.
- **Before → after examples:**
  - "Helped with the migration…" → "Supported the migration…"
  - "I led the the migration…" → "Led the migration…"
  - "Utilized SQL in order to build reports on a weekly basis" → "Used SQL to build reports weekly"
  - "Due to the fact that … a large number of launches." → "Because … many launches."

**No-fact invariant: proof**
1. **Property test.** Every fix and every choice was applied to every corpus text plus 5 adversarial texts: no new number, symbol, word outside the allowlist or stronger claim, and the prefix and suffix outside the span are kept. This is checked by an independent re-statement of the invariant, not the production checker.
2. **Word lists.** Every opener choice and wordy replacement is in `COACH_ALLOWED_WORDS`, and none is in `ELEVATED_CLAIM_WORDS`.
3. **Forged fixes.** Forged fixes adding a number, percentage, currency, date, technology, employer, achievement or "Led"/"Managed" are refused by the guard. Through `applyFix` they are refused even earlier, because they cannot be reproduced.
4. **Mutation checks.** Each grounding check is killed by at least one test (below).

**Tests: 350** (298 before, all still passing; the old "Coach not available yet" test became a real Coach gating test, and +50 in `coach.test.ts`)
- **Rules:** positive, negative and borderline cases for every rule.
- **Corpus:** no false positives, every rule exercised, before/after counts.
- **No-fact:** the property test and the word-list checks.
- **Grounding:** attacks with forged fixes.
- **Apply semantics:**
  - stale text, stale context, altered finding;
  - a stale finding is refused before analysis;
  - choices need an explicit valid choice;
  - advice cannot be applied;
  - idempotent to a fixed point;
  - deterministic.
- **Limits:** 6,000 accepted and 6,001 refused; context 300 accepted and 301 refused; long opener, unknown field and non-string refused.
- **Entitlement:**
  - FREE is refused before analysis, even for text the engine would refuse.
  - FREE cannot apply an earlier finding.
  - One check to analyse and one to apply.
  - Premium lost between the two: refused, and no text is returned.
  - Paywall resume.
- **Architecture:**
  - `domain/coach` is pure.
  - Only `PremiumTools` runs the engine.
  - The Coach is on exactly the five fields.
  - No teaser copy.
  - No new dependency.

**Mutation checks (19, each reverted; all killed)**

| Mutation | Tests that fail |
|---|---|
| No check before analysis | 4 |
| No check before apply | 3 |
| Grounding: number check off | 3 |
| Grounding: symbol check off | 1 |
| Grounding: new-word check off | 3 |
| Grounding: stronger-claim check off | 2 |
| Grounding: "led" allowed | 1 |
| Apply skips grounding | 9 |
| Apply skips text binding | 1* |
| Apply skips reproduction | 2 |
| Default choice | 1 |
| Measurable inserts "by 20%" | 4 |
| No text limit | 1 |
| No context limit | 1 |
| "Led" offered for "Helped with" | 4 |
| Long-bullet threshold 31 | 1 |
| Passive flags honours | 2 |
| Capitalise any first word | 2 |
| Tense with unsure siblings | 1 |

\*Text binding overlaps with reproduction. A test now pins its own effect: stale findings are refused before any analysis.

**Validation:** clean install ✅, `tsc` ✅, `expo lint` ✅, 350/350 ✅. iOS and Android release bundles ✅: fake store, billing SDKs, AI SDKs, `playwright-core`, `@napi-rs`, testing libraries and spell-check dictionaries all absent. No dependency changes.

**Not possible without an LLM (stated in the app: "Suggestions only…")**
- Free rewording for clarity or a more professional tone.
- Restructuring sentences; turning passive into active.
- Spelling and real grammar analysis.
- Choosing a verb that fits the context.

The passive and tense checks are pattern-based and deliberately narrow, so they miss cases rather than flag wrong ones.

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator (NOT RUN) |
|---|---|
| Rules, corpus, no-fact invariant, grounding, gating, limits, architecture, bundles | The Coach link and panel layout under fields and bullet rows, keyboard interaction, and applying while typing (iOS and Android) |
| | The paywall round trip from "Coach 🔒" on a device |

### 19.9 Step 9 record: ATS Readability Checker (FREE)

**Scope amendment (owner decision).**
- This plan did not contain an ATS checker; its step 9 was Import. The owner approved the "Near-Term Features" list as official extra scope, and its first item, the **ATS Readability Checker**, became step 9. Import is now step 9b and has not been started.
- Constraints set by the owner:
  - a standalone feature;
  - **Resume Score (step 7) untouched**: no ATS category change, no scoring change, golden tests unchanged;
  - FREE, with no paywall on the result;
  - no score, percentage or pass/fail claim;
  - no Import, PDF or DOCX parsing;
  - no Keyword Match or Keyword Gap.

**What it checks.** Only what can be proven from the resume's own data and from how this app exports it. Statuses: **Readable**, **Check this**, **Potential issue**. Presence: **Detected** / **Not detected**.

| # | Rule | What it checks | Conservative limits |
|---|---|---|---|
| 1 | Contact details | Name, email (well-formed), phone (7–15 digits; digits, spaces, `+ - . / ( )`, "ext."), location, LinkedIn or website (no spaces; looks like an address) | Names with titles, suffixes, apostrophes and any script are fine; the phone is "check", not "issue" |
| 2 | Section headings | Which sections exist (7 detections); the headings are the renderer's fixed standard names as plain text | Missing Experience = potential issue; missing Education or Skills = check; whitespace-only content does not count |
| 3 | Template text | Letter-spaced name or headings that a PDF text layer splits into letters ("S U M M A R Y"); points to the Word export or a template without letter-spacing | Derived from the template config; **verified for all 12 templates against a real PDF** |
| 4 | Layout | One column; contact in the main text (not a page header or footer); real, selectable text; the split header is read in order | Always Readable for the current templates; the claim is **verified** (PDF reading order and DOCX with no header, footer or table) |
| 5 | Symbols and special characters | Emoji, icon-font (private-use), "fancy" math letters, broken "�": potential issue. Dingbats, shapes, box drawing, full-width: check | Letters of every script, accents, dashes, smart quotes, `• → ≈ © ® ™ °` are fine; one finding per field |
| 6 | Invisible characters | Zero-width space, word joiner, BOM, soft hyphen, control characters, line or paragraph separators; line breaks in one-line fields | ZWNJ/ZWJ (part of Persian and Indic spelling), tabs and line breaks in paragraphs are fine |
| 7 | Bullets | Manual bullet glyphs or numbering at the start (the template adds bullets), line breaks inside a bullet, repeats within one list | ">" is not a glyph ("> 99.9% uptime"); "-3%", "3.5M", "#1" are content; the same bullet in two roles is fine |
| 8 | Dates | Recognized formats ("Mar 2020", "March 2020", "03/2020", "2020-03", "2020", "Present"; ranges; "Expected …"), missing start or end, reversed order, mixed month-name and numeric styles | Year-only is not "numeric"; optional dates (certifications, education) are only checked when present; untitled entries are left to rule 10 |
| 9 | Formatting | `**bold**`, `# heading`, decorative repeated punctuation (`!!!`, `-----`), long all-capital prose (≥ 4 words, ≥ 20 letters) | Not names, titles or skills; "C#", "#1", "..." are fine |
| 10 | Entries | Empty experience entries (print as a blank block), entries with no title or company, education with no degree or school, projects or certifications with no name, repeated entries | Fully empty optional entries (projects, certifications) are not reported |

**Implementation**
- `domain/ats/` is pure, and imports only `domain/resume` and `domain/templates`:
  - `types.ts`;
  - `fields.ts`, which lists every text field with its editor location;
  - `dates.ts`;
  - `template-facts.ts`;
  - `rules.ts`;
  - `ats.ts`: `checkAtsReadability(data, templateId)` normalizes the data first, as the renderer does.
- **UI:** a new **ATS** tab in Tools, next to Check (no new screen). It shows:
  - a counts line ("1 potential issue · 2 to check" or "No issues detected");
  - a "What a parser can find" card with Detected / Not detected;
  - one card per rule with its status, summary and findings;
  - **Improve** on located findings, which opens the editor section (the step 7 route).
  - The disclaimer reads: "…ATS software varies; no ATS guarantee is implied."
- FREE: no entitlement or paywall code on its path (guarded).
- No persistence, no schema change, no dependency.

**False positives found and fixed (narrowed)**

| Case | Problem | Fix |
|---|---|---|
| "> 99.9% uptime" | Read as a manual bullet | ">" removed from the glyphs |
| Python "`__init__`" | Read as Markdown bold | The `__x__` pattern is **disabled** (it cannot be told apart from dunder names); `**x**` and `#` are still checked |
| Skills such as "AWS CLOUD PRACTITIONER" | Flagged as all capitals | Skills are exempt |
| "- Managed a team" vs "Managed a team" | Not detected as a repeat | Repeats are compared without the glyph |

**Not implemented (not provable, or not ATS readability)**
- **Font size or colour contrast:** it does not affect the text layer.
- **A separate "Skills" heading:** the renderer puts skills under Summary. Reporting it would flag every resume, and the user cannot fix it without a template change (owner decision needed).
- **Keyword coverage:** that is Job Match / Keyword Gap, out of scope.

**Product finding for the owner.** Real PDF output shows that 9 of 12 templates export letter-spaced text:
- the name, in the 4 upper-case-name templates;
- the headings, in the 6 underline or small-caps heading templates.

A PDF text layer splits both into single letters. The checker reported this honestly and pointed to the DOCX export. **Resolved in step 9a (§19.9a):** the letter-spacing is now 0.08em, and all 12 templates export whole words.

**Corpus** (`__tests__/fixtures/ats-corpus.ts`)
- **Strong (5):** the sample, a UK engineer with ISO dates and "C++/C#", a multilingual resume with accents, an Arabic name and location, and a resume with certification and expected dates. **0 findings** in the plain template. In letter-spaced templates, only the template-text finding, checked over all 12 templates.
- **Weak (8):** each flags only its own rule:

  | Resume | Findings | Rules flagged |
  |---|---|---|
  | missingContact | 4 | contact |
  | symbols | 3 | characters |
  | invisible | 3 | invisible |
  | bullets | 7 | bullets |
  | dates | 6 | dates |
  | formatting | 4 | formatting |
  | entries | 6 | entries + sections |
  | noExperience | 3 | sections |

- **Edge (5):**
  - empty: 7 findings (contact + sections);
  - long (12 roles), multiline and punctuation-heavy: 0 findings;
  - malformed: repaired, then contact, sections and dates are reported.

**Tests: 383** (350 before, all still passing; +33 in `ats.test.ts`)

| Area | Covered |
|---|---|
| Rules | positive, negative, borderline and false-positive guards for all 10 rules; the date grammar on its own |
| Corpus | strong × 12 templates, weak, edge |
| Properties | 300 generated resumes from a fixed-seed generator: never throws, fixed rule order, status equals the worst finding, unique ids, locations are real editor sections |
| Determinism | same input gives the same report; the resume is not modified |
| No score | no score, percentage, "compatible" or "guarantee" wording |
| Real output | DOCX for all 12 templates (headings and name are whole words; no header, footer or table); **Chromium PDF + pdf.js** for all 12 templates (letter-spacing claims hold exactly; name → phone → email → summary order; contact in the main text; bullets intact) |
| Architecture | `domain/ats` pure; no entitlement or paywall on the ATS path; only the ATS tab uses the engine; Resume Score and Check untouched |

**Mutation checks: 22, all caught.**
- *Missed detections:* email accepts anything; no phone digit range; missing Experience not flagged; heading or name letter-spacing ignored; emoji or zero-width space missed; line breaks in one-line fields ignored; duplicates keep the glyph; any date accepted; order never checked; mixed formats ignored; duplicate or untitled entries ignored; no normalization; status ignores findings.
- *False positives:* all non-ASCII flagged; ZWNJ flagged; ">" as a bullet; all-capitals on short text; `__x__` Markdown.
- *Copy:* score-like wording.

**Validation:** clean install ✅, `tsc` ✅, `expo lint` ✅, 383/383 ✅. iOS and Android release bundles ✅: the ATS engine is included; fake store, billing SDKs, AI SDKs, testing and spell-check libraries are absent. No dependency, schema or persistence changes.

**Verified vs. not verified**

| Verified in code (this environment) | Not verified on a device or simulator (NOT RUN) |
|---|---|
| Rules, corpus, properties, template claims against Chromium PDF and generated DOCX | The ATS tab layout and Improve navigation on iOS and Android |
| | Letter-spacing in `expo-print` PDFs (WebKit on iOS, Chromium-based on Android): expected the same, not confirmed |

### 19.9a Step 9a record: PDF typography / ATS extraction fix

**Decision (owner).** Set letter-spacing to 0.08em on the three heading styles (`underline`, `small-caps`, `small-caps-rule`) and on the upper-case name. Nothing else changes. Banner (0.06em) and plain (0.04em) headings stay as they were.

**Root cause (investigation).**
- Chromium writes every glyph as its own positioned text operation, and extractors rebuild words from the gaps between glyphs.
- Letter-spacing alone decides the split. Upper case, small caps, font family and font size have no effect.
- Words stayed whole up to 0.10em and split from 0.12em, and pdf.js and pdfminer.six agreed exactly.
- The templates used 0.12em for headings and 0.15em for names. 0.08em leaves a margin below the limit.

**Change**
- `render-html.ts`:
  - exports `HEADING_TRACKING_EM` and `NAME_TRACKING_EM`;
  - the CSS and the name's inline style use them (0.08em for the changed values).
- `ats/template-facts.ts`:
  - the letter-spacing facts are now derived from the renderer's tracking and the measured limit (`MAX_WHOLE_WORD_TRACKING_EM = 0.10`), instead of a fixed list;
  - the ATS checker therefore reports no template-text issue today, and would flag any future widening.
- `ats/rules.ts`: the template-text check accepts an optional tracking value (tests only).
- No other ATS rule, Resume Score, dependency, schema or persistence change.

**Results**

| Check | Result |
|---|---|
| PDF extraction (Chromium, the 12 templates; name + all 6 headings) | **12/12 whole words** with pdf.js and with pdfminer.six (before: 3/12) |
| DOCX extraction (12 templates) | 12/12 whole words; no header, footer or table (unchanged) |
| Element geometry (every element in `.content`, 12 templates, before vs after) | **0 boxes changed**: no wrapping, height or position change |
| Pixels | the 9 affected templates changed (glyph spacing only); the 3 others are byte-identical |
| Visual review | tracking still clearly wide, design identity kept, no overlap with marks |
| Step 5 (parity and layout), Step 9 (ATS), rasterizer suites | pass |

**Tests: 384** (383 before; the ATS template-text test became two: the current renderer is clean in 12/12, and the rule still flags the pre-9a tracking in exactly the 9 templates).

**Mutation checks: 9, all caught.**
- Heading or name tracking set back to 0.12 or 0.15 in the constants.
- The renderer hard-codes `.12em` or `.15em` instead of the constants.
- Facts limit loosened; facts ignore heading or name tracking.
- The rule ignores the tracking input.
- Banner widened to 0.12.

**Validation:** clean install ✅, `tsc` ✅, `expo lint` ✅, 384/384 ✅, iOS and Android release bundles ✅. Step 7 files untouched.

**Not verified (NOT RUN).**
- `expo-print` output on devices.
  - Android prints through the Chromium-based WebView, so the same result is expected.
  - iOS prints through WebKit and CoreGraphics, so it needs confirmation.
- To check without EAS: a local `npx expo run:ios|android` build (or an Expo Go probe that calls `Print.printToFileAsync`), then the same pdf.js + pdfminer.six extraction on the exported files.

## 20. Major risks and failure modes

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **"Free to build" makes screenshots a substitute for export** | Lower conversion | Per-page watermark, non-selectable text, screen-resolution only. The paid output is vector PDF, editable DOCX and a clean high-resolution PNG. No false claim of screenshot prevention |
| 2 | App Review 3.1.2: auto-renewing subscriptions must provide ongoing value | Rejection | Ongoing tools (Job Match and tailoring per application, Coach, unlimited exports); full disclosures; review notes |
| 3 | Subscribe → export → cancel churn | Revenue | Owner's commercial model; watch retention after launch |
| 4 | Users expect a cloud account | Missed expectation | Resolved: Local Profile only (§4.6); clear "stored on this device" copy; free backup |
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

**Approved (previously open):**
1. **Local Profile**, not an account: device-only, no login, password, cloud or backend identity (§4.6).
2. FREE: template default color + the web app's 8 presets. PREMIUM: adds the custom accent color.
3. Cover Letter is completely FREE: generate, edit, copy, share.
4. No free trial or introductory offer in V1.
5. Family Sharing is OFF in V1.

**Deferred to step 11:** verification option [A]; product IDs; Terms and Privacy URLs.

# My Resume — mobile-only architecture plan

**Status: plan only.** Nothing here has been implemented. No billing SDK, no AI, no EAS builds.
**Revision 2:** pricing changed from $5 per template to one **$7.99/month "premium" subscription**.

**Product decisions (owner):**

| Decision | Value |
|---|---|
| Product | **My Resume**, a standalone iOS + Android app. No website, no web product |
| Repository | `MANZUL/MyResume` |
| iOS bundle ID / Android package | `com.manzul.myresume` |
| Language | English only in V1 |
| AI | None, anywhere. Every feature is deterministic and on-device |
| Backend | None for normal use. The only online operations are store purchase, restore, refresh and subscription management |
| Pricing | **$7.99/month auto-renewing subscription**, one entitlement: **`premium`**. No per-template purchases, no template entitlements |
| Free forever | **Cover Letter**, plus the core FREE tier defined in §4.2 |
| Payment providers (later) | Apple App Store subscriptions (iOS), Google Play subscriptions (Android). No Dodo |

**Sources:**
- The web repo `MANZUL/Resume` (commit `8e04af0`) is the **product specification** only.
- The prototype `resume-mobile/` is **not** a source of truth. §18 classifies it module by module.
- This document supersedes the option-C "shared web/mobile core" recommendation in `MOBILE_PARITY_AUDIT.md`.
  That audit's inventory and evidence remain valid.
- `PAYMENT_AUDIT.md` covers the web product and is not relevant to this app.

The types below are **design notation**, not code to paste in.

---

## 1. Complete feature inventory (the specification)

These features were extracted from the web code. The prompts in `attached_assets/` were used only to understand intent. "Tier" is the V1 decision; items marked † are my proposal and need confirmation (see the end of this document).

| # | Spec feature | Where in spec | Mobile approach | Tier |
|---|---|---|---|---|
| 1 | Home value props (Upload → Improve → Apply; Improve / Tailor / Check / Export). The spec's "$5 once / No subscription" copy is **replaced** by the subscription offer | `home.tsx:298-506` | Native home screen | Free |
| 2 | Live sample preview on home | `home.tsx:331-341` | Pre-rendered template image | Free |
| 3 | Template gallery: 12 templates, "All + 6 categories", thumbnails, descriptions | `TemplateGallery.tsx`, `templates.ts` | Native gallery (browse all 12) | Free to browse |
| 4 | Start from a template (loads the sample in that template) | `home.tsx:202-212` | Same | Free† |
| 5 | Brand: logo mark and colors | `home.tsx:282-287` | App name **My Resume**; icon and splash derived from the logo mark | — |
| 6 | Upload PDF/DOCX (8 MB; extension + MIME + magic-byte checks) | `resume-upload.ts` | On-device import (§8) | Free |
| 7 | Paste resume / LinkedIn / notes → draft | `resume-parser.ts` (AI) | Deterministic parser + review (§8) | Free |
| 8 | Parse failure → blank editor + message; upload failure → suggest paste | `home.tsx:144-147,165-171` | Same | Free |
| 9 | Create from scratch | `startBlank` | Same | Free |
| 10 | Sample resume (Eleanor Vance) | `sample-data.ts` | Same content | Free |
| 11 | Autosave working draft (resume, template, accent, target JD) | `home.tsx:89-113` | SQLite autosave for every resume + its target job | Free |
| 12 | Save / list / reopen drafts | `/resumes` API | Local library | Free |
| 13 | Close editor | `handleClose` | Back navigation; nothing discarded | Free |
| 14–20 | Editor sections: personal, summary (tagline/bullets/skills), experience, education, certifications, projects, awards | `ResumeEditor.tsx` | Native forms, same fields | Free |
| 21 | Empty-list hint copy | `ResumeEditor.tsx:361-365` | Same | Free |
| 22 | Improve with AI (6 actions on 5 field types) | `ResumeEditor.tsx:408-466`, `resume-ai.ts` | **Writing Coach**, deterministic (§3) | **Premium** |
| 23 | Job Match: JD, keywords, matched/missing, %, title, honesty note | `ResumeTools.tsx`, `resume-ai.ts:104-180` | Local engine (§9) | **Premium** |
| 24 | Tailoring suggestions: Accept / Reject / Review section | `ResumeTools.tsx:187-218` | Deterministic, fact-preserving (§9) | **Premium** |
| 25 | Resume Check: score, categories, strengths, warnings, jump-to-section, "No ATS guarantee" disclaimer | `resume-score.ts`, `ResumeTools.tsx:283-326` | Same rules and copy | Free† |
| 26 | Cover letter from resume + JD; editable, copy, regenerate | `resume-ai.ts:182-219` | Deterministic, JD-aware (§10) | **Free (owner decision)** |
| 27 | 12 templates with exact styling | `templates.ts`, `TemplateRenderer.tsx` | One data-driven renderer (§7) | Preview free; clean output premium |
| 28 | Template picker (category + description). Changing the template resets the accent | `home.tsx:578-616,607` | Same | Free to select† |
| 29 | Accent presets (template default + 8 spec colors) | `home.tsx:623` | Same palette | **Premium**† (free = template default accent) |
| 30 | Custom accent color | `home.tsx:634-643` | Native picker | **Premium** |
| 31 | Live preview | right panel | Preview screen | Free (watermarked for FREE users) |
| 32 | PDF export | `window.print()` | Local PDF, Letter/A4 (§11) | **Premium** |
| 33 | Word export | `export-docx.ts` | Same generator (§11) | **Premium** |
| 34 | Paywall ("Template access · $5") | `ExportBar.tsx` | **Replaced** by a single premium subscription paywall (§4) | — |
| 35 | Entitlement per visitor + template | `payments.ts:25-33` | **Replaced** by one `premium` entitlement bound to the store account | — |
| 36 | Error boundary | `error-boundary.tsx` | Root boundary with a "your data is saved" message | Free |

**Validation rules carried over from the spec:**

| Input | Rule |
|---|---|
| Pasted text | ≤ 50,000 characters |
| Uploaded file | ≤ 8 MB; PDF or DOCX; extension, MIME type and magic bytes must agree |
| Improve input | ≤ 6,000 characters; context ≤ 300 |
| Job description | ≤ 25,000 characters |
| Resume JSON used for analysis | ≤ 60,000 characters |
| Accent color | Must be `#RRGGBB` |
| Grounding | Numbers and specialized terms in any output must already appear in the source |

**Grounding invariant for all deterministic features:** never insert a fact, number, skill, employer or date that is not already in the user's own text.

**Not carried over:** health indicator, SEO/OG meta, 404 page, visitor cookie, Dodo, rate limiting, `mockup-sandbox`.

---

## 2. Mobile-only feature architecture

```
src/
  app/                 Expo Router screens only (thin)
  features/            library/ editor/ templates/ preview/ export/ import/
                       job-match/ cover-letter/ coach/ check/ paywall/ settings/
  domain/              pure TypeScript, no React / React Native / Expo imports, fully unit-tested
    resume/            model, schema version, validation, migrations, sample
    templates/         catalog (12 configs + fonts), palettes
    render/            resume → HTML (preview + PDF), resume → DOCX model
    parse/  match/  letter/  coach/  check/
    access/            FeatureKey catalog + policy: canUse(feature, AccessSnapshot)
  services/            side effects behind interfaces (injected, fakeable)
    storage/           SQLite repositories + migrations
    subscription/      SubscriptionService + StoreProvider implementations
    export/            PDF / DOCX / file / share
    import/            document picker, DOCX/PDF text extraction
  ui/                  design system
```

**Rules:**
- `domain/` never imports `services/`.
- No module outside `services/subscription/providers/` may import a billing SDK.
- No network code exists outside that folder. The existing no-AI/no-network test is extended to enforce this.
- **Premium checks live in the feature services and the export service** (`canUse(...)`), not only in the UI.

**Screens:**

| Screen | Spec source |
|---|---|
| Home (library + value props + start actions) | Landing + saved drafts |
| Template gallery | Gallery + curated cards |
| Import (file / paste) → Review import | Upload + paste |
| Editor (sections, Coach entry points for premium users) | Left panel |
| Preview + template/customize | Right panel + picker bar |
| Tools: Check, Job Match, Cover Letter | Editor tools tabs |
| **Premium paywall** (one plan) | Replaces ExportBar/checkout |
| Settings: subscription status, Manage subscription, Restore purchases, backup/restore data, paper size, Terms, Privacy | Mobile-specific |

---

## 3. AI → deterministic replacement map

| Spec AI feature | Deterministic replacement | Parity | Stated limitation | Tier |
|---|---|---|---|---|
| Parse pasted text | Rule-based parser (§8): heading dictionary, date grammar, layout-aware lines, LinkedIn mode, per-field confidence, **unassigned-lines bucket**, mandatory review step | Close for resumes with headings | "Check each section; lines we couldn't place are listed at the bottom." | Free |
| Upload + parse | DOCX and text-PDF extraction on device, then the same parser | Good for text-based files | **No OCR for scanned PDFs**; the app suggests pasting instead | Free |
| Improve / concise / professional / impact / grammar | **Writing Coach** rules (below): a reason for each finding, plus a one-tap fix where it is safe | Suggestions instead of rewrites | Free-form stylistic rewriting is an accepted non-AI limitation | Premium |
| Improve: measurable | If a bullet has no number, ask "Can you add a measurable result here?" This is the spec's own no-number behavior (`resume-ai.ts:12,76`) | Same | — | Premium |
| Job Match keywords + job title | Bundled skills taxonomy + JD section weights + phrase extraction + alias normalization (§9) | Close for common roles | Finite taxonomy | Premium |
| Tailoring suggestions | Fact-preserving structural suggestions (§9) | Partial | "Suggestions only reuse what's already in your resume." | Premium |
| Cover letter (+ verification pass) | JD-aware template generator (§10) | Close in structure | "Review and personalize before sending." | **Free** |

### Writing Coach rules

- **Weak openers** ("responsible for", "helped", "worked on", "duties included", "tasked with"): suggests 3–5 strong verbs. The user picks one; nothing is replaced automatically.
- **Filler words** ("results-driven", "team player", "passionate", "various", "etc."): suggests removing them.
- **Passive voice.** Flagged, no automatic fix.
- **First-person pronouns** in bullets. Flagged, no automatic fix.
- **Bullets longer than 32 words** (the spec's threshold): suggests splitting.
- **Achievement bullet with no number:** asks the "measurable" question.
- **Mechanics, with automatic fix:** double spaces, missing initial capital, inconsistent final periods, repeated words, a/an.
- **Tense:** current role in present tense, past roles in past tense.
- **Repetition:** the same opening verb on 3 or more bullets.
- **Concise table** ("in order to" → "to", "utilize" → "use"): the change is shown as a preview before it is applied.

The Coach runs on the same 5 field types that have "Improve with AI" in the spec.

---

## 4. Payment / product architecture (single `premium` subscription)

### 4.1 Commercial model
- **One auto-renewing subscription: $7.99 per month.** One entitlement: `premium`.
- The stores localize the price in other countries. $7.99 is a standard price point on both stores, so it can be set exactly.
- No per-template products, no template entitlements, no one-time purchases in V1.
- If the subscription is cancelled, premium stays active until the end of the paid period.

### 4.2 FREE vs PREMIUM

| Capability | FREE | PREMIUM |
|---|---|---|
| Create, edit, store, delete, duplicate resumes | ✓ | ✓ |
| Import (paste, DOCX, PDF) + review | ✓ | ✓ |
| Browse the gallery; select any of the 12 templates; preview | ✓ preview carries a "PREVIEW" watermark† | ✓ clean preview |
| Accent color | template default only† | spec presets + custom color |
| Paper size (Letter/A4) | ✓ (setting only) | ✓ |
| Resume Check (score, warnings, jump-to-section) | ✓† | ✓ |
| **Cover Letter** (generate, edit, copy, share) | ✓ **(always free)** | ✓ |
| Writing Coach | — (entry points shown with a premium badge) | ✓ |
| Job Match | — | ✓ |
| Tailoring suggestions | — | ✓ |
| PDF export, DOCX export | — | ✓ |
| Backup export/import of own data | ✓ (user data is never paywalled) | ✓ |

**Principles:**
- A user's data is never held hostage. When premium lapses, every resume stays readable and editable. Premium styling already saved on a resume (such as a custom accent) is kept and still shown in the preview, which falls back to the watermark. Edits the user already accepted from tailoring remain, because they are the user's text.
- Engines run locally no matter what the user pays for. For example, the Cover Letter (free) uses the Job Match engine internally to pick evidence. **Gating applies to the features, not the engines.**

### 4.3 Product configuration (IDs configured later)
```
BillingConfig {                       // app config; the only place store IDs live
  entitlementId: 'premium'
  ios:     { subscriptionGroup: 'My Resume Premium', productIds: ['<configure>'] }   // e.g. com.manzul.myresume.premium.monthly
  android: { subscriptionId: '<configure>', basePlanIds: ['<configure>'] }           // e.g. premium / monthly
  displayFallback: { price: '$7.99', period: 'month' }   // UI shows this only if the store offer can't be loaded; the store's localized price wins
}
```
All product IDs map to exactly **one** entitlement, `premium`. Adding an annual plan later means adding a product ID, not changing the code.

### 4.4 Access abstraction (vendor-neutral)
```
AccessTier = 'FREE' | 'PREMIUM'

PremiumStatus =
  | 'active'            // paid, auto-renew on or off, before expiry
  | 'grace_period'      // billing problem, store still grants access → PREMIUM
  | 'billing_retry'     // iOS retry without grace / Android account hold → FREE
  | 'paused'            // Android pause → FREE
  | 'pending'           // Ask to Buy / deferred payment → FREE until confirmed
  | 'expired' | 'revoked' | 'never_subscribed'
  | 'unknown'           // no verified data yet

AccessSnapshot {
  tier: AccessTier
  status: PremiumStatus
  expiresAt?: epochMs
  willRenew?: boolean
  source: 'store' | 'cache' | 'none'
  lastVerifiedAt?: epochMs          // last time the store confirmed this state
}

domain/access.canUse(feature: FeatureKey, snapshot) → { allowed, reason }
  FeatureKey = 'export.pdf' | 'export.docx' | 'coach' | 'jobMatch' | 'tailoring'
             | 'customize.accentPresets' | 'customize.customAccent' | 'preview.clean'
  (cover letter, check, import, editing are not FeatureKeys: they are always allowed)

SubscriptionService {                // app-facing
  snapshot(): AccessSnapshot         // synchronous, from memory
  subscribe(listener): Unsubscribe
  refresh(): Promise<AccessSnapshot> // silent; never shows a store sign-in
  getOffer(): Promise<Offer | Unavailable>              // localized price, period, intro offer if any
  purchase(): Promise<'subscribed' | 'pending' | 'cancelled' | 'failed'>
  restore(): Promise<AccessSnapshot> // may show a store sign-in
  manageSubscription(): Promise<void> // opens the store's subscription management
}

StoreProvider {                      // one implementation per platform or vendor
  currentEntitlements(): Promise<VerifiedSubscription[]>  // store-verified state only
  fetchOffers(config): Promise<Offer[]>
  buy(productId): Promise<VerifiedSubscription | Pending | Cancelled>
  sync(): Promise<VerifiedSubscription[]>                  // explicit restore
  onUpdate(listener)                  // renewals, expiry, refunds, grace, Ask-to-Buy approvals
  finish(tx): Promise<void>           // iOS finish / Android acknowledge
  openManagement(): Promise<void>
}
```

**Providers:**
- `FakeStoreProvider` now, for development and tests. It can script: subscribe, cancel-at-period-end, renew, expire, grace, billing retry, pause, refund, pending, offline and clock changes.
- A real provider comes later, after separate approval. See §13 for how each candidate establishes "verified".

### 4.5 Trust rule (requirement: not trusted from local storage alone)
- **Only a `StoreProvider` result that the store has verified may set `PREMIUM`.**
  - iOS: StoreKit 2 transactions and entitlements whose JWS signature StoreKit has verified.
  - Android: subscriptions returned by Play Billing (`queryPurchasesAsync`) for this account, in state `PURCHASED`, with a valid signature.
- The local cache is a **UX cache**: it lets the app start in the right state and stay usable offline. It cannot grant anything by itself beyond the offline-trust window in §13. Editing the cache does not bypass the store: the next refresh overwrites it.
- **No "isPremium" flag anywhere that user-editable storage alone can turn on.**

---

## 5. Offline data architecture

- **SQLite on the device is the source of truth for user data.** There is no sync.
- Everything goes through repositories. Screens never touch SQL directly.
- **Derived data is recomputed, not stored:** score, match results, Coach findings.
- **User-edited generated text is stored:** cover letters.
- **Access state:** `subscription_cache` holds only store-derived facts plus `lastVerifiedAt`. `SubscriptionService` owns it, and nothing else writes to it.
- **Network use** is limited to the subscription provider: offers, purchase, restore, refresh and management.

---

## 6. Resume domain model

The content model is **identical to the spec's `ResumeData`**, from `openapi.yaml`.

```
ResumeData {
  name
  contact { phone, email, location, linkedin, website }
  summary { tagline, bullets[], skills[] }
  experience[] { title, company, location, start, end, summary, bullets[] }
  education[] { degree, school, location, date, honors }
  certifications[] { name, org, date }
  projects[] { name, description, bullets[] }
  awards[]
}

Resume {
  id: uuid
  title
  templateId
  accent: '#RRGGBB'
  data: ResumeData
  schemaVersion: 1
  createdAt
  updatedAt
  deletedAt?            // "Recently deleted", kept for 30 days
}

TargetJob     { id, resumeId, title, company, description, updatedAt }
CoverLetter   { id, resumeId, targetJobId?, tone, body, updatedAt }
ImportSession { id, sourceKind: 'paste' | 'docx' | 'pdf', rawText, draft, unassigned[], confidence }   // transient
```

- **No tier information is stored on any resume.** Tier is always computed at runtime from `AccessSnapshot`.
- **Validation:** the spec limits from §1, a hex-only accent, and list-size guards.
- **Migrations:** pure functions per `schemaVersion`, tested against fixture data.

---

## 7. Template architecture

- **Templates are data.** The 12 `TemplateConfig` entries are copied verbatim from the spec.
  - Premium unlocks clean use of all 12.
  - There is no per-template product mapping.
- **One renderer** produces a self-contained HTML string. The same string drives the preview (a WebView with JavaScript and navigation disabled) and the PDF.
  - The parity target is the spec's `TemplateRenderer.tsx`, matched rule by rule.
- **Fonts** are the spec's own: Playfair Display (serif) and Plus Jakarta Sans (sans), both OFL-licensed, embedded for offline use.
  - The prototype currently uses Georgia. That is a parity bug to fix.
- **Thumbnails:** 12 images of the sample resume, pre-rendered at build time from the same renderer.
- **Customization:**
  - Changing the template resets the accent to that template's default.
  - Presets and the custom color are premium.
  - Paper size (Letter/A4) is a setting.
- **Preview by tier:**
  - FREE: a diagonal "PREVIEW" watermark and non-selectable text.
  - PREMIUM: clean.
  - The watermark never appears in an exported file, because FREE users cannot export.
- **DOCX** follows the spec's generator: a single Word style with accent-colored headings.

---

## 8. Import architecture (free)

```
[Pick file | Paste] → extract text → normalize → parse → Review → create Resume
```

| Step | Design |
|---|---|
| Pick | `expo-document-picker` for PDF, DOCX and TXT, with the spec limits (8 MB; extension, MIME and magic bytes) |
| DOCX → text | Unzip on device (JSZip, already a dependency of `docx`), then read `word/document.xml`: paragraphs, numbering → bullets, tabs, table rows |
| PDF → text | pdf.js from a bundled asset, running in a hidden WebView with no network. Rebuild lines from glyph positions, keep columns apart, turn large horizontal gaps into separators |
| Scanned PDF | Show an explanation and offer paste instead. **No OCR** |
| Normalize | Unify bullets, dashes and spacing; strip page numbers and repeated headers/footers |
| Parse | Heading dictionary + ALL-CAPS/short-line heuristics; date grammar (ignoring durations like "3 years 6 months"); entry grouping; LinkedIn-profile mode |
| Confidence / unassigned | Every field gets a confidence level. Every line that isn't placed is listed on the review screen, so nothing is lost silently |
| Review | Confirm section by section. Low-confidence fields are highlighted. A one-tap action moves a line into a section |
| Guarantee | Parsed values are verbatim substrings of the source. This invariant is unit-tested |
| Failure | Open a blank editor with a message; the raw text stays available to copy |

**Parser test corpus** (all English):
- clean ATS resume
- `pdftotext -layout`-style layout
- LinkedIn copy (the failure case from the parity audit)
- notes only
- two-column PDF

---

## 9. Job Match architecture (premium)

```
JD → segment → extract → normalize → weight → evidence → score + gaps + suggestions
```

- **Segment** the JD into: title, responsibilities, required, preferred ("nice to have", "bonus"), and about-the-company.
- **Extract** terms in two ways:
  - **Taxonomy match:** a bundled, versioned skills taxonomy with aliases (for example `JS` → JavaScript, `k8s` → Kubernetes, "A/B testing").
  - **Phrase candidates:** 2–3-word noun phrases from requirement lines, after expanded stopword and generic-term filters (dropping words like "nice", "team", "experience", "5+").
- **Weight** each term as section weight × frequency × type. Section weights: required 1.0, responsibilities 0.7, preferred 0.5, other 0.3. Keep the top 12–20 terms.
- **Evidence:** match terms against the resume using normalization, aliases and light stemming. Record **where** each match was found.
- **Output:**
  - fields: `jobTitle`, weighted `matchPercent`, `matched[]` with evidence, and `missing[]` tagged required or preferred;
  - the spec's honesty copy about missing terms.
- **Tailoring suggestions** (premium) are deterministic and never invent anything. Each shows current → suggested, a reason, and Accept / Reject / Review section:
  1. A skill already proven in a bullet but not listed in Skills → add it to Skills.
  2. Reorder Skills so JD-matched skills come first.
  3. The resume uses an alias and the JD uses the canonical name → use the JD's name.
  4. The JD's title term appears in the user's experience but not in the tagline → suggest it for the tagline.
- **Persistence:** the JD is stored as a `TargetJob` per resume. Results are recomputed.
- **Regression pairs**, including the parity-audit case:
  - must find `SQL`, `A/B testing` and `stakeholder management`;
  - must not emit `nice` or `5+`;
  - must match `user research`.

---

## 10. Cover Letter architecture (FREE)

- **Inputs:** the resume, its `TargetJob`, and the output of the Job Match *engine*. The engine runs locally even for FREE users; only the Job Match *screen* is premium.
  - Optional overrides: hiring manager, company, role.
- **Extracting details from the JD:**
  - Company, from patterns like "About X", "at X", "X is hiring" or "Company:".
  - Role, from the first line, "Title:" or "Position:".
  - Anything missing becomes a visible `[Company]` or `[Role]` placeholder.
- **Evidence:** the 2–3 of the user's bullets that overlap most with the JD, quoted **verbatim**. Skills come only from `matched[]`.
- **Composition:**
  - Three tones: formal, concise, warm.
  - Four paragraph templates: opening, fit, evidence, close.
  - Sentence variants are seeded deterministically, and "Regenerate" cycles through them.
- **Guarantee:** any text that is not fixed template wording comes from the resume or from the JD's company and role fields. This is unit-tested.
- **Output:** editable, saved, copy and share. **Always free.** No paywalled export of the letter in V1; the spec only offered copy.

---

## 11. PDF / DOCX export architecture (premium)

```
ExportService.export(resumeId, format, paper)
  1. canUse('export.pdf' | 'export.docx', subscription.snapshot())
       → denied → open the Premium paywall; after subscribing, continue automatically
  2. load + validate the Resume
  3. PDF:  render(resume, template, {mode: 'pdf', paper}) → expo-print printToFileAsync
     DOCX: buildDocx(resume)                              → write the file
  4. file name "<Name>_<Template>.pdf|docx" in the cache dir
  5. share sheet; clean up stale export files on the next launch
```

- **Fully offline** once the snapshot says PREMIUM, including a PREMIUM state served from the cache within the trust window (§13).
- **PDF:**
  - Letter (612×792 pt) or A4 (595×842 pt).
  - 0.75 in margins: the iOS `margins` option, and `@page` on Android.
  - Embedded fonts and selectable text; entries never split across pages (`break-inside: avoid`).
  - Each platform must be verified separately.
- **DOCX:** the spec's generator, with base64 output.

---

## 12. Storage architecture

**Engine:** `expo-sqlite` (bundled with SDK 57), with WAL mode and versioned migrations. AsyncStorage is not used: the prototype keeps everything in one JSON blob, and Android enforces size limits.

| Table | Contents |
|---|---|
| `resumes` | id, title, template_id, accent, data_json, schema_version, created_at, updated_at, deleted_at |
| `target_jobs` | id, resume_id, title, company, description, updated_at |
| `cover_letters` | id, resume_id, target_job_id, tone, body, updated_at |
| `subscription_cache` | single row: status, tier, product_id, expires_at, will_renew, last_verified_at, clock_high_water_mark |
| `settings` | key, value |
| `meta` | db_version |

- **Autosave:** debounced by about 400 ms, one transaction per resume, applied as functional updates.
- **User backup:** "Export all data" writes versioned JSON (resumes, jobs, letters). **Subscription state is never included.** "Import backup" merges by id. Backup is **free**.
- **OS backup:**
  - iOS device backups include the app container.
  - Android Auto Backup is on by default in Expo (`allowBackup: true`). It restores up to 25 MB of app data on reinstall when the user has backup enabled.
  - Exclude the export cache and `subscription_cache` from backups. The store is re-queried after a restore.

---

## 13. Security model

**Assets:**
- the user's resume data (personal information);
- the `premium` entitlement.

### 13.1 How "verified" is established (decided when the provider is chosen)

| Option | iOS | Android | Backend? |
|---|---|---|---|
| A. Store client APIs on device | StoreKit 2 `Transaction.currentEntitlements` / `updates`; StoreKit verifies the JWS | Play Billing `queryPurchasesAsync(SUBS)`, signature check, purchase state; returns active subscriptions from the Play Store client | None |
| B. RevenueCat | Server-validated receipts + Trusted Entitlements signature | Same | Third-party (not ours) |
| C. Own verifier | App Store Server API | Play Developer API `subscriptionsv2` | A minimal verifier, used only for purchase and refresh |

All three satisfy "verified store state, not local storage". The `StoreProvider` interface fits all three.

**Trade-off:**
- A adds no dependency, but a rooted or jailbroken device can hook it.
- B and C resist tampering better and give server-side renewal and refund data. C conflicts least with "no backend for normal usage" only if it is limited to purchase and refresh.

**Recommendation for V1: A**, keeping B as a drop-in upgrade.

### 13.2 Threats

| Threat | Control | Residual risk |
|---|---|---|
| FREE user tries to export or use premium features | `canUse` inside the feature and export services. The preview is watermarked and non-selectable, with JS off and no print path | Screenshot of a watermarked preview (accepted) |
| Edited local cache or storage | Cache is UX only. A refresh overwrites it. No user-editable grant flag | Rooted devices can patch the app (accepted; mitigated by option B/C) |
| Fake or replayed purchase / modified store response | Grants only from store-verified transactions (§4.5, §13.1) | Depends on provider option |
| **Clock rollback to extend a cached subscription** | Store `clock_high_water_mark`. If the device clock is earlier than the mark, treat the cache as stale and require a store refresh before granting | — |
| **Staying offline forever to keep premium** | **Offline trust window.** Cached PREMIUM is honored until `min(expiresAt, lastVerifiedAt + 7 days)`†, then the app drops to FREE until a refresh succeeds. The user sees "Connect to verify your subscription" | 7-day window† |
| Expired, refunded or revoked subscription | Store update listener + refresh on launch and foreground → FREE. Files already exported remain | Accepted |
| Billing retry / account hold / pause / pending | Status mapping in §4.4. Only `active` and `grace_period` grant premium | — |
| Resume privacy | No network except billing. No analytics, no AI. Data stays in the sandbox. Export cache is cleaned. The backup file is labeled as containing personal data | The user controls sharing |
| Injection through resume content | HTML escaping everywhere; hex-only accent; WebView with JS off and navigation blocked; input size limits | — |
| AI or network creep | CI test fails on any AI SDK, `fetch`, or network code outside `services/subscription/providers` | — |

---

## 14. What happens when the app is offline

| Capability | Offline behavior |
|---|---|
| Create, edit, store, delete, import (paste/DOCX/text PDF), gallery, preview, Resume Check, **Cover Letter**, backup | Work fully, for every user |
| Premium features (Coach, Job Match, tailoring, customization, clean preview, PDF/DOCX export) | Work if the cached snapshot is PREMIUM and still inside the trust window (§13). Otherwise locked, with "Connect to the internet to verify your subscription" |
| Subscribe, restore, manage subscription | Unavailable, with a clear message. The cache is not changed |
| Paywall price | Uses the cached store offer if one exists. Otherwise shows the `$7.99/month` fallback text, and the Subscribe button is disabled until the device is online |

---

## 15. What happens after reinstall

1. **User data**
   - iOS deletes it on uninstall unless the whole device is restored from a backup.
   - Android may restore it through Auto Backup.
   - If neither applies, the library starts empty and **Import backup** is offered.
2. **Subscription**
   - On first launch, `refresh()` silently reads the store's current entitlements. This does not prompt for sign-in.
   - An active subscription on the same store account unlocks PREMIUM automatically when the device is online.
   - Offline on first launch: FREE (the cache is empty or excluded from backup) until the first successful refresh.
   - **Restore purchases** is always available in the paywall and in Settings (Apple requires this).
3. **Messaging:** the empty library explains the backup option. A "Back up your resumes" reminder appears after the third resume or the first export.

---

## 16. What happens after a purchase (subscribe)

1. The paywall opens from a premium entry point, such as Export, Coach, Job Match, Tailor or Customize. It remembers which action triggered it.
2. The paywall shows everything Apple guideline 3.1.2 and Google policy require:
   - plan name and localized price per month, and that it auto-renews;
   - how to cancel;
   - intro-offer terms, if any†;
   - links to Terms of Use and Privacy Policy;
   - Restore and Not now.
3. `purchase()` opens the store sheet. Possible outcomes:
   - **Subscribed:**
     1. The provider receives the verified transaction and calls `finish`. On Android it **acknowledges** the purchase; Play refunds unacknowledged purchases after 3 days.
     2. The snapshot becomes `active`/PREMIUM, `subscription_cache` is written, and a PREMIUM snapshot is emitted.
     3. The watermark disappears and premium surfaces unlock.
     4. **The triggering action continues automatically**, for example the export.
   - **Pending** (Ask to Buy, deferred payment): the app shows "We'll unlock Premium when the purchase is approved". The update listener finalizes it later, even after a restart.
   - **Cancelled:** no change, no error.
   - **Failed:** a readable error with retry. Nothing is granted.
   - **Already subscribed** on this store account: the purchase is treated as a restore.
4. **Crash mid-purchase:** the unfinished transaction is delivered on the next launch and processed the same way.
5. **Later lifecycle events** arrive through the listener or refresh:
   - renewal extends `expiresAt`;
   - cancel-at-period-end sets `willRenew=false` and access stays until expiry, with a notice in Settings;
   - expiry or refund moves the user to FREE, and their data stays intact (§4.2).

---

## 17. What happens when a purchase is restored

1. The user taps **Restore purchases** in the paywall or in Settings. This needs a connection.
2. `restore()` calls `sync()`, which may show the store sign-in, and returns the verified subscription state for this store account.
3. The result maps to `premium`:
   - an active or grace-period subscription → PREMIUM, with the `expiresAt` refreshed;
   - otherwise → FREE, with a message such as "No active subscription for this account" or "Your subscription expired on <date>".
4. The cache is **replaced** with the store's answer.
   - A single failed call never downgrades the user. The downgrade happens only after a successful store answer, or when the trust window runs out.
5. **Offline or error:** the app shows a message and leaves the cache untouched.
6. **Store account switching:** refreshing on launch and foreground picks up the new account's state. Resumes stay on the device whatever account is signed in.

---

## 18. Classification of the current `resume-mobile` prototype

| Module | Verdict | Reason |
|---|---|---|
| `src/lib/types.ts` | **REFACTOR** | `ResumeData` shape is correct. Add `schemaVersion`, `TargetJob`, `CoverLetter` and uuids, and move to `domain/resume` |
| `src/lib/sample-data.ts` | **KEEP** | Spec content, verbatim |
| `src/lib/templates.ts` | **REFACTOR** | The 12 configs are verbatim. Add font metadata. **No product IDs**: premium is not per template |
| `src/lib/text.ts` | **KEEP** | Escaping, hex check and file names are correct |
| `src/lib/resume-score.ts` | **KEEP** | Spec rules (Resume Check, FREE†); move to `domain/check` |
| `src/lib/render-html.ts` | **REFACTOR** | The single-renderer approach, escaping and watermark are right. Wrong fonts, no A4. Needs a parity pass against the spec renderer |
| `src/lib/export-docx.ts` | **KEEP** | Spec generator; verify under Hermes on a device |
| `src/lib/export.ts` | **REFACTOR** | Gate through `canUse` with `SubscriptionService`; add paper size and cleanup |
| `src/lib/parse-text.ts` | **REWRITE** | Fails on LinkedIn-style text and keeps layout spacing. No confidence levels, no unassigned bucket |
| `src/lib/job-match.ts` | **REWRITE** | Frequency-only: emits noise and misses core skills |
| `src/lib/cover-letter.ts` | **REWRITE** | Ignores the job description |
| `src/lib/access.ts` | **REFACTOR** | The concept now fits: one entitlement, fail-closed, unlocked only in dev builds. Needs the subscription states, expiry, trust window, clock guard and FeatureKey policy; becomes `domain/access` |
| `src/lib/purchases.tsx` | **DELETE** | Couples RevenueCat directly to the UI with a one-time-purchase model. Billing SDKs are out of scope for now |
| `src/lib/store.tsx` | **REWRITE** | AsyncStorage blob with a stale-closure update pattern → SQLite repositories |
| `src/components/ui.tsx` | **REFACTOR** | Move into `ui/`; keep the look |
| `src/app/_layout.tsx` | **REFACTOR** | New providers (DB, subscription) plus an error boundary |
| `src/app/index.tsx` | **REFACTOR** | Keep the library. Add spec home content and the subscription offer, not the "$5 once" copy |
| `src/app/import.tsx` | **REWRITE** | Becomes the file + paste → review flow |
| `src/app/resume/[id]/index.tsx` | **REFACTOR** | Keep the section forms. Add stable keys, jump-to-section, Coach hooks and repository updates |
| `src/app/resume/[id]/preview.tsx` | **REFACTOR** | Keep the hardened WebView. Use the spec palette plus custom color, gated premium. Add the category picker, tier watermark and paper size |
| `src/app/resume/[id]/tools.tsx` | **REWRITE** | Persist the JD, add suggestions and jump-to-section, correct the cover-letter inputs, add per-tool gating (Cover Letter free) |
| `src/app/unlock.tsx` | **REWRITE** | One-time-purchase copy ("no subscription") backed by RevenueCat. Becomes the Premium subscription paywall with 3.1.2 disclosures |
| `src/__tests__/access.test.ts` | **REFACTOR** | Keep the fail-closed and dev-only cases. Add subscription states, trust window and clock rollback |
| `src/__tests__/parse-text.test.ts` | **REWRITE** | Replaced by the corpus suite |
| `src/__tests__/tools.test.ts` | **REFACTOR** | Keep the escaping, accent-injection, DOCX-validity and no-AI/no-network guards. Replace the match and letter tests |
| `app.json` | **REFACTOR** | Name "My Resume", `com.manzul.myresume`, real icons. Remove the `BILLING` permission until billing lands |
| `assets/*.png` | **DELETE** | Expo placeholders |
| `eas.json` | **KEEP** | Standard profiles; no builds now |
| Tooling: `eslint.config.js`, `vitest.config.mts`, `tsconfig.json`, `AGENTS.md`, `CLAUDE.md` | **KEEP** | — |
| Deps `react-native-purchases`, `react-dom`, `react-native-web` | **DELETE** | RevenueCat and its web peer deps; there is no web target |
| Dep `@react-native-async-storage/async-storage` | **DELETE** | Replaced by `expo-sqlite` |
| `README.md` | **REWRITE** | Describes the prototype's one-time unlock |
| `PAYMENT_AUDIT.md` | **DELETE** (or archive) | About the web product |
| `MOBILE_PARITY_AUDIT.md` | **KEEP** (history) | Evidence still valid; its option-C decision is superseded |
| Location `Cal-/resume-mobile` | **MOVE** | New home is `MANZUL/MyResume` (migration step 0) |

**Tally:** KEEP 7 · REFACTOR 13 · REWRITE 9 · DELETE 5, plus 1 move.

**Keep** the spec data and the renderer approach. **Rewrite** the intelligence (parse, match, letter), storage and the paywall. **Refactor** the access policy into the subscription model.

---

## 19. Migration order

Every step ends with typecheck, lint, unit tests and the no-AI/no-network guard passing. Steps marked ◆ also need a device QA gate.

| Step | Work | Exit criteria |
|---|---|---|
| 0 | Create `MANZUL/MyResume`; move the prototype with its history; set name "My Resume" and bundle/package `com.manzul.myresume`; brand assets. Open decisions (end of document) answered | Repo builds under the new identity |
| 1 | Restructure into `domain/ services/ features/ ui/`. Move the KEEP modules. Delete `purchases.tsx` and the RevenueCat, web and async-storage dependencies | Builds; tests pass |
| 2 | Domain model v1, validation and migrations; SQLite repositories; library on SQLite | CRUD and migration tests |
| 3 | **Access and subscription architecture:** FeatureKey catalog + `canUse`; `AccessSnapshot` with all `PremiumStatus` states; `SubscriptionService` over `FakeStoreProvider`; `subscription_cache` with trust window and clock guard; FREE/PREMIUM gating wired into preview (watermark), customization and tools; one Premium paywall screen (fake offer, 3.1.2 layout); Settings subscription section | Scripted tests: subscribe, pending, cancel-at-period-end, renew, expire, grace, retry, pause, refund, offline within and beyond the window, clock rollback, reinstall-empty-cache |
| 4 | Renderer parity (fonts, rules, Letter/A4); pre-rendered thumbnails; gallery; picker; spec palette + custom color (premium-gated) | ◆ Visual parity on iOS and Android |
| 5 | Export service (PDF/DOCX, share, cleanup) behind `canUse`, continuing after subscribe | ◆ Multi-page PDF and DOCX on both platforms |
| 6 | Editor parity; Resume Check (FREE†) with jump-to-section | ◆ Editor pass |
| 7 | Writing Coach (premium) | Rule tests; no-fact-insertion invariant |
| 8 | Import: parser rewrite + corpus, review screen, DOCX, PDF (pdf.js), errors | Corpus thresholds ◆ real files |
| 9 | Job Match engine + taxonomy + persistence + tailoring (premium); then Cover Letter (FREE), reusing the engine | Regression pairs; letter grounding test; gating test (letter works when FREE) |
| 10 | **(Separate approval)** Real `StoreProvider`s for the chosen §13.1 option. App Store Connect subscription group + product; Play subscription + base plan; product IDs in `BillingConfig`; Terms/Privacy URLs; sandbox and license testing for the full lifecycle (subscribe, renew, cancel, expire, grace, retry/hold, pause, refund, Ask to Buy, restore, reinstall, account switch) | ◆ Full matrix on both stores |
| 11 | Backup export/import, settings, error boundary, accessibility, performance on low-end Android | ◆ Release-candidate QA |
| 12 | **(Separate approval)** EAS builds and store submission | — |

---

## 20. Major risks and failure modes

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **App Review 3.1.2: auto-renewing subscriptions must give ongoing value.** A resume builder can be seen as a one-time need | Rejection | Position ongoing value (Job Match and tailoring per application, Coach, unlimited exports and edits); full 3.1.2 disclosures on the paywall; clear review notes |
| 2 | Subscribe → export → cancel churn | Lower revenue | Commercial risk (owner's model). Track retention once live; data and cover letters stay free, so goodwill is kept |
| 3 | **On-device verification (option A)** can be hooked on rooted devices | Revenue leakage | Accept for V1 or move to option B/C; the interface allows either |
| 4 | Subscription lifecycle edge cases (grace, hold, pause, refunds, Ask to Buy, family sharing†) | Wrong tier | Explicit states, a listener and refresh on launch/foreground, the step-10 test matrix |
| 5 | Play acknowledgement missed | Automatic refund after 3 days | Acknowledge inside the provider; unfinished purchases processed on next launch |
| 6 | Offline trust window too strict or too loose | Paying users locked out offline, or longer free use after cancelling | 7-day default†, clear message, re-verify immediately when back online |
| 7 | Device clock manipulation | Extends cached premium | High-water-mark clock guard (§13) |
| 8 | **Data loss** (reinstall, device change) with no server | Users lose resumes | Free backup export/import; OS backup on; reminders |
| 9 | iOS vs Android print differences | PDF differs from the preview | Embedded fonts; per-platform golden files |
| 10 | Parser accuracy on real resumes | Poor first impression | Review step, unassigned bucket, corpus, paste fallback |
| 11 | pdf.js WebView memory and speed; no OCR | Failed imports | Size, page and time caps; clear fallback |
| 12 | Taxonomy coverage (English only in V1) | Weak matches in niche fields | Versioned taxonomy with phrase fallback; stated limitation |
| 13 | Non-AI experience feels weaker than the spec's AI | Lower perceived quality | Honest copy; safe one-tap fixes; never claim AI |
| 14 | Legal pages required (Terms, Privacy) for subscriptions and stores | Submission blocked | Static hosted pages. This is not an app backend and is not needed at runtime |
| 15 | Keeping prototype code because its tests pass | Hidden drift from the spec | §18 classification plus a parity checklist at each step |

---

## Decisions

**Resolved:**
- Mobile-only product, no AI, offline-first.
- Repository `MANZUL/MyResume`; name My Resume; `com.manzul.myresume`.
- English only in V1.
- **$7.99/month `premium` subscription**, no per-template products.
- Cover Letter free.
- No Dodo; no backend for normal use.

**Open (marked † above), needed before step 3. My proposal is in brackets:**
1. Can FREE users select every template and preview it with a watermark? [yes]
2. Is Resume Check free? [yes — it is the spec's free "CHECK" value and drives conversion]
3. Do FREE users get only the template default accent, with presets and custom color premium? [yes]
4. Can FREE users start from a template in the gallery? [yes]
5. Free trial or introductory offer? [none in V1 unless you decide otherwise]
6. Family Sharing for the subscription? [off]
7. Length of the offline trust window? [7 days]

**Can wait until step 10:**
- Verification option A, B or C. [A for V1]
- Product IDs.
- Terms and Privacy URLs.

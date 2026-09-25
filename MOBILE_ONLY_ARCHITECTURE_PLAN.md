# MyResume mobile-only architecture plan

**Status: plan only. No implementation code, no billing SDK, no AI, no EAS builds.**

**Framing (from the product owner):**
- The web repo `MANZUL/Resume` (commit `8e04af0`) is the **product specification**.
- The Expo app is the **implementation target**: one standalone iOS + Android product. There is no
  website, no web export and no backend for normal use.
- AI is never required.
- The commercial model stays **$5 per template**, sold through Apple In-App Purchase and Google Play Billing.

**This supersedes** the architecture recommendation (option C, "shared web/mobile core") in
`MOBILE_PARITY_AUDIT.md`. That audit's feature inventory and evidence still hold.
`PAYMENT_AUDIT.md` is about the web product and is no longer relevant to the target.

The type shapes below are **design notation**, not code to paste in.

---

## 1. Complete feature inventory (the specification)

These are extracted from the web code. The briefs in `attached_assets/` were used only to understand
intent. The "Mobile approach" column is the plan, not the current prototype.

| # | Spec feature | Where in the spec | Mobile approach |
|---|---|---|---|
| 1 | Home: value props (Upload → Improve → Apply; Improve / Tailor / Check / Export), "$5 once, no subscription" | `home.tsx:298-506` | Native home screen with the same content, adapted to a phone layout |
| 2 | Live sample preview on home | `home.tsx:331-341` | Pre-rendered template image (see 7) |
| 3 | Template gallery: 12 templates, "All + 6 categories", thumbnails, descriptions | `TemplateGallery.tsx`, `templates.ts` | Native gallery using pre-rendered thumbnails |
| 4 | Start from a template (loads the sample in that template) | `home.tsx:202-212` | Same |
| 5 | Brand: "MY RUSEME" name, logo mark, colors | `home.tsx:282-287`, `index.html` | App name, icon and splash from the logo. **The name spelling needs an owner decision** ("RUSEME" looks like a typo) |
| 6 | Upload PDF / DOCX (max 8 MB, extension + MIME + magic-byte checks) | `resume-upload.ts` | On-device import (see 8) |
| 7 | Paste resume / LinkedIn profile / notes → structured draft | `resume-parser.ts` (AI) | Deterministic parser + review step (see 8) |
| 8 | Parse failure → blank editor with a message; upload failure → suggest paste | `home.tsx:144-147,165-171` | Same behavior |
| 9 | Create from scratch | `startBlank` | Same |
| 10 | Sample resume (Eleanor Vance) | `sample-data.ts` | Same content |
| 11 | Auto-save the working draft (resume, template, accent, target JD) | `home.tsx:89-113` | SQLite autosave for every resume, including its target job |
| 12 | Save / list / reopen drafts | `GET/POST/PATCH /resumes` | Local library (no server) |
| 13 | Close editor | `handleClose` | Back navigation. Nothing is discarded |
| 14–20 | Editor sections: personal (6 fields), summary (tagline, bullets, skills), experience, education, certifications, projects, awards | `ResumeEditor.tsx` | Native forms with the same fields |
| 21 | Empty-list hint: "Nothing added. Leave this empty if you do not need it." | `ResumeEditor.tsx:361-365` | Same copy |
| 22 | Improve with AI: improve / concise / professional / impact / grammar / measurable on tagline, experience summary, experience bullets, project description, project bullets | `ResumeEditor.tsx:408-466`, `resume-ai.ts` | Writing Coach, deterministic (see 3) |
| 23 | Job Match: JD input, keywords, matched/missing, %, job title, honesty note | `ResumeTools.tsx`, `resume-ai.ts:104-180` | Local engine (see 9) |
| 24 | Tailoring suggestions: current → suggested + reason; Accept / Reject / Review section; never auto-applied | `ResumeTools.tsx:187-218` | Deterministic, fact-preserving suggestions (see 9) |
| 25 | Resume Check: score /100, 4 categories, strengths, warnings, "Improve" jumps to the section, "No ATS guarantee" disclaimer | `resume-score.ts`, `ResumeTools.tsx:283-326` | Same rules and copy |
| 26 | Cover letter from resume + JD; editable; copy; regenerate | `resume-ai.ts:182-219` | Deterministic, JD-aware generator (see 10) |
| 27 | 12 templates with exact styling rules | `templates.ts`, `TemplateRenderer.tsx` | One renderer driven by template data (see 7) |
| 28 | Template picker: category tabs + name + description; picking a template resets the accent to its default | `home.tsx:578-616,607` | Same behavior |
| 29 | Accent presets: template default + `#171717 #1A365D #0F766E #065F46 #B45309 #9F1239 #4338CA #E63946` | `home.tsx:623` | Same palette |
| 30 | Custom accent color | `home.tsx:634-643` | Native color picker (hex + swatches), fully local |
| 31 | Live preview | right panel | Preview screen; later a split view on tablets |
| 32 | PDF export (selectable text; paper size chosen in the print dialog) | `window.print()` | Local PDF, Letter or A4 (see 11) |
| 33 | Word export (`docx`, Georgia, accent-colored section headings) | `export-docx.ts` | Same generator (see 11) |
| 34 | Paywall: "Template access · $5, one-time purchase for PDF & Word" | `ExportBar.tsx:44-47` | Per-template paywall (see 4) |
| 35 | Entitlement = visitor + **template**, unlocks **both** PDF and Word, across all resumes | `payments.ts:25-33` | Same scope, bound to the store account |
| 36 | Error boundary / crash fallback | `error-boundary.tsx` | Root error boundary with a "your data is saved" message |

**Validation rules in the spec** (ported as local limits):
- Pasted text is capped at 50,000 characters.
- Upload is capped at 8 MB, must be PDF or DOCX, and must pass the extension, MIME and magic-byte checks (`%PDF-` / `PK\x03\x04`).
- Improve input is capped at 6,000 characters (context 300).
- Job description is capped at 25,000 characters.
- Resume JSON used for analysis is capped at 60,000 characters.
- Accent must be `#RRGGBB`.
- AI outputs pass grounding guards: every number must appear in the source, and specialized terms must appear in the source (`source-grounding.ts`).

**Rule for the deterministic features:** they reuse the spec's grounding principle. **They never
insert a fact, number, skill, employer or date that is not already in the user's own text.**

**Not carried over** (web-only):
- health indicator
- SEO / OG meta
- 404 page
- visitor cookie
- Dodo checkout
- rate limiting
- `mockup-sandbox`

---

## 2. Mobile-only feature architecture

```
src/
  app/                 Expo Router screens only (thin: layout + wiring)
  features/            one folder per feature: screens' components + hooks + view-models
    library/  editor/  templates/  preview/  export/  import/
    job-match/  cover-letter/  coach/  check/  paywall/  settings/
  domain/              pure TypeScript, no React / React Native / Expo imports; fully unit-tested
    resume/            model, schema version, validation, migrations, sample
    templates/         catalog (12 configs + product ids + fonts), palette
    render/            resume → HTML (preview + PDF), resume → DOCX model
    parse/             text → ResumeDraft (+ confidence, unassigned lines)
    match/             skill taxonomy, JD analysis, scoring, suggestions
    letter/            cover-letter generator
    coach/             writing rules
    check/             resume score (spec rules)
    entitlements/      policy: canExport(templateId, snapshot)
  services/            side effects behind interfaces (injected, fakeable)
    storage/           SQLite repositories + migrations
    entitlements/      EntitlementService + providers (Fake now; store later)
    export/            PDF (expo-print), DOCX (docx), file + share
    import/            document picker, DOCX/PDF text extraction
  ui/                  design system: tokens, primitives, native-feeling components
```

**Rules:**
- `domain/` never imports `services/`.
- Features talk to services only through interfaces.
- No module outside `services/entitlements/providers/` may import any billing SDK.
- No `fetch` or network code outside the entitlement provider. The existing no-AI / no-network test is kept and extended.

**Screens** (Expo Router), mapped from the spec:

| Screen | Spec source | Kind |
|---|---|---|
| Home (library + value props + start actions) | landing + saved drafts | root |
| Template gallery | gallery + curated cards | push |
| Import (choose file / paste) → Review import | upload + paste | modal flow |
| Editor (sections) | left panel | push |
| Preview + template/customize | right panel + picker bar | push |
| Tools: Check / Job Match / Cover Letter | editor tools tabs | push, with tabs |
| Paywall (one template) | ExportBar + checkout | sheet |
| Settings: restore purchases, backup / restore data, paper size, about / privacy | none in the web (these are needed on mobile) | push |

---

## 3. AI → deterministic replacement map

| Spec AI feature | Deterministic replacement | Parity | Limitation stated to the user |
|---|---|---|---|
| **Parse pasted text** | Rule-based parser (see 8): heading dictionary, date-range grammar, bullet/indent/layout awareness, LinkedIn-profile mode, per-field confidence, **"unassigned lines" bucket** so no text is silently lost, then a mandatory review step | Close, for resumes with headings. Lower for free-form notes | "Check each section. Lines we couldn't place are listed at the bottom." |
| **Upload + parse** | DOCX: unzip + paragraph/numbering extraction on device. PDF: text-layer extraction on device. Then the same parser | DOCX good. PDF good for text-based PDFs | **Scanned/image PDFs are not supported** (no OCR). Suggest paste |
| **Improve (improve/concise/professional/impact/grammar)** | **Writing Coach**: per-field rule checks, each with a reason and, where safe, a one-tap fix (see list below) | Different UX: suggestions instead of a rewritten sentence | "Coach suggestions don't rewrite your meaning. You stay in control." Free-form stylistic rewriting is an **accepted non-AI limitation** |
| **Improve: measurable** | If a bullet has no number, show the question "Can you add a measurable result here?" (this **is** the spec's no-number behavior, `resume-ai.ts:12,76`) | Same | — |
| **Job Match keywords + title** | Bundled skill/tool taxonomy + JD section weighting + phrase extraction + alias normalization; title heuristics (see 9) | Close for common roles | Taxonomy coverage is finite. Unknown jargon is matched as a plain phrase |
| **Tailoring suggestions** | Fact-preserving structural suggestions: surface skills already proven in bullets, reorder skills, align wording to the JD's canonical skill name when the resume has a known alias (see 9) | Partial: no free rewriting | "Suggestions only reuse what's already in your resume." |
| **Cover letter (+ verification pass)** | JD-aware template generator: company/title from the JD, evidence bullets chosen by keyword overlap, 3 tones, placeholders for missing facts (see 10) | Close in structure; less fluent | "Review and personalize before sending." |

**Writing Coach rules**, all deterministic and all tied to one field or bullet:

| Rule | Auto-fix? |
|---|---|
| Weak opener ("responsible for", "helped", "worked on", "duties included", "tasked with"), with 3–5 strong-verb options (e.g. "helped" → supported / contributed to / assisted) | Offered only as a choice the user picks |
| Filler phrases ("results-driven", "team player", "passionate", "various", "etc.") | Suggest removal |
| Passive voice ("was/were/been + past participle") | No |
| First-person pronouns ("I", "my", "we") in bullets | No |
| Length over 32 words (the spec's threshold) | No; suggest a split |
| No number in an achievement bullet (the "measurable" question) | No |
| Mechanics: double spaces, missing initial capital, inconsistent final period across bullets, repeated word ("the the"), "a/an" before a vowel sound | Yes |
| Tense: current role in present tense, past roles in past tense (keyed on "Present"/"Current" end dates) | No |
| Same opening verb used on 3+ bullets | No; suggest variety |
| "Concise": wordy-phrase table ("in order to" → "to", "a number of" → "several", "utilize" → "use") | Offered as a preview |

The Coach is surfaced on the same five field types where the spec shows "Improve with AI".

---

## 4. Payment / product architecture

### 4.1 Commercial model (preserved from the spec)
- **12 non-consumable products, one per template.**
  - Buying template T unlocks **PDF and Word** export for **every resume** rendered in T, forever
    (matching `payments.ts`, where status ignores `exportType` and `resumeId`).
- Editing, preview (watermarked when locked), Check, Job Match, Cover Letter, import and the Coach are free.
- Price: **$5 per template**. Stores use fixed price points: the nearest US price is **$4.99**, and
  other storefronts are localized automatically. **This is an owner decision**, because "$5" cannot
  be set exactly.
- No subscription, no bundle. (A future "all templates" bundle would be a new product; it is
  explicitly **not** part of this plan.)

### 4.2 Product catalog (static data in `domain/templates`)
```
TemplateProduct {
  templateId: 'corporate-boardroom' | ... (12)
  iosProductId:     'com.<bundle>.template.corporate_boardroom'
  androidProductId: 'template_corporate_boardroom'
  priceTierUSD: 4.99          // display fallback only; the store's price is authoritative
}
```

### 4.3 Entitlement abstraction
Nothing outside `services/entitlements` knows about Apple, Google or RevenueCat.

```
EntitlementState = 'owned' | 'not_owned' | 'pending' | 'revoked' | 'unknown'

EntitlementSnapshot {
  byTemplate: Record<TemplateId, { state, source: 'store' | 'cache', verifiedAt?: epochMs }>
  lastRefreshAt?: epochMs
}

EntitlementService {                       // app-facing
  snapshot(): EntitlementSnapshot          // synchronous, from memory (hydrated from cache)
  subscribe(listener): Unsubscribe
  refresh(): Promise<EntitlementSnapshot>  // silent; never shows a store sign-in
  getOffer(templateId): Promise<Offer | Unavailable>   // localized price
  purchase(templateId): Promise<PurchaseOutcome>       // purchased | pending | cancelled | failed
  restore(): Promise<RestoreOutcome>                   // may show a store sign-in
}

StoreProvider {                            // implemented once per platform or vendor
  queryOwned(): Promise<StoreTransaction[]>
  fetchOffers(productIds): Promise<Offer[]>
  buy(productId): Promise<StoreTransaction | Pending | Cancelled>
  syncWithStore(): Promise<StoreTransaction[]>   // explicit restore
  onTransactionUpdate(listener)                  // purchases, revocations, Ask-to-Buy approvals
  finish(tx): Promise<void>                      // iOS finish / Android acknowledge
}

domain/entitlements.canExport(templateId, snapshot) → { allowed, reason }
```

**Providers:**
- `FakeStoreProvider`: now, for development and tests. Scriptable purchase, cancel, pending, revoke
  and offline behavior.
- Later, one of the following. **The choice is deferred**; the interface is identical for all three:
  - (a) native StoreKit 2 + Play Billing via a community Expo IAP module;
  - (b) RevenueCat;
  - (c) native plus a small receipt-verification function.

**Rule:** the export code path calls `canExport` **inside** the export service, not only in the UI.

---

## 5. Offline data architecture

- **Source of truth:** SQLite on the device. There is no remote sync.
- Every read and write goes through repositories. Screens never touch SQLite directly.
- **Derived data is not stored** (score, match results, coach findings). It is recomputed from the
  resume and job text, so it is always consistent.
- **User-authored generated content is stored** (edited cover letters), because it has been edited
  and is no longer derived.
- **The entitlement cache** lives in its own table. It holds only store-derived facts, and the store
  refresh overwrites it (see 13).
- Network is used only by the entitlement provider (offers, purchase, restore, refresh).

---

## 6. Resume domain model

The content model is **identical to the spec's `ResumeData`** (openapi.yaml): same fields, same
required-ness, strings default to `""` and lists to `[]`. This keeps content faithful and makes
import/export of backups trivial.

```
ResumeData {           // unchanged from the spec
  name
  contact { phone, email, location, linkedin, website }
  summary { tagline, bullets[], skills[] }
  experience[] { title, company, location, start, end, summary, bullets[] }
  education[] { degree, school, location, date, honors }
  certifications[] { name, org, date }
  projects[] { name, description, bullets[] }
  awards[]
}

Resume {               // app wrapper (replaces the spec's server row)
  id: uuid
  title
  templateId
  accent: '#RRGGBB'
  data: ResumeData
  schemaVersion: 1
  createdAt, updatedAt
  deletedAt?           // soft delete → "Recently deleted" for 30 days
}

TargetJob    { id, resumeId, title, company, description, createdAt, updatedAt }   // spec persisted one JD per draft
CoverLetter  { id, resumeId, targetJobId?, tone, body, createdAt, updatedAt }
ImportSession{ id, sourceKind: 'paste' | 'docx' | 'pdf', rawText, draft: ResumeData, unassigned[], confidence }  // transient
```

- **Validation** (`domain/resume/validate`): the spec limits (section 1), hex accent, trimmed strings,
  max list lengths (guards against pathological input).
- **Migrations:** `schemaVersion` bumps come with pure migration functions that are unit-tested on
  fixture JSON.

---

## 7. Template architecture

- **Templates are data.** The 12 `TemplateConfig` entries are carried over verbatim from the spec:
  `id`, `name`, `category`, `description`, `defaultAccent`, fonts, alignment, header style, marks,
  date alignment, skills style, rule variant. Each gains its `TemplateProduct`.
- **One renderer.** `domain/render/html(resume, template, options)` → a self-contained HTML string.
  - It is used for both the **preview** (a WebView with JavaScript off and navigation blocked) and
    the **PDF**, so what you see is what you export.
  - Parity target is the spec's `TemplateRenderer.tsx`, rule by rule: section order, uppercase
    headings, contact separators, date alignment, skills styles, decorative marks, the partner /
    educator rule.
- **Fonts, offline.** Bundle the spec's fonts: **Playfair Display** (serif) and **Plus Jakarta Sans**
  (sans), both under the OFL. Embed them as `@font-face` data so preview and PDF render identically
  offline. The current prototype uses Georgia, which is a parity bug.
- **Thumbnails.** The gallery and the home hero use **12 pre-rendered images of the sample resume**,
  generated at build time from the same renderer. Rendering 12 WebViews live is too heavy on phones.
  The selected template always renders live.
- **Customization:**
  - Accent: the spec palette plus a custom color.
  - Changing the template resets the accent to that template's default (spec behavior).
  - Paper size: Letter / A4 (a mobile setting; the spec relied on the browser print dialog).
- **Locked preview.** For a template the user does not own, the preview shows a diagonal "PREVIEW"
  watermark. Owned templates show a clean preview.
- **DOCX** follows the spec's generator (one Word style, accent-colored headings). Making the Word
  file follow each template's look is **out of scope** (the spec does not do it).

---

## 8. Import architecture

```
[Pick file | Paste text] → extract text → normalize → parse → Review screen → create Resume
```

| Step | Design |
|---|---|
| Pick | `expo-document-picker`: PDF, DOCX, TXT. Enforce spec limits (8 MB, extension + MIME + magic bytes) |
| DOCX → text | Unzip on device (the JSZip already bundled via `docx`). Read `word/document.xml`: paragraphs; list numbering → bullet marker; tabs → gap; tables row by row (the spec's `decodeXml` behavior, plus bullets) |
| PDF → text | Text-layer extraction on device with **pdf.js running offline inside a hidden WebView** (a bundled asset, no network). Rebuild lines from glyph positions, keep columns apart, turn big horizontal gaps into a separator (fixes the `Initech ... Austin` layout-spacing bug) |
| Scanned PDF | No text layer → explain and offer paste. **No OCR** (accepted limitation) |
| Normalize | Unicode bullets, dashes, spacing; strip page numbers and repeated headers/footers |
| Parse | Section headings (dictionary + ALL-CAPS/short-line heuristics); date-range grammar (months, seasons, `MM/YYYY`, `YYYY–Present`, durations like "3 years 6 months" ignored); entry grouping by date anchors and title/company line patterns; **LinkedIn profile mode** (title line / company line / date line / duration line stacks) |
| Confidence | Per field (high / medium / low) from rule strength |
| Unassigned | Every source line not placed goes into an "Unassigned text" list on the review screen, so nothing is lost |
| Review | Section-by-section confirm; low-confidence fields highlighted; lines can be moved into a section with one tap |
| Guarantee | Parser output is verbatim substrings of the source (a unit-tested invariant, mirroring `isParsedValueGrounded`) |
| Failure | If nothing parses, open a blank editor with a message and the raw text available to copy (spec behavior) |

**Parser test corpus** (fixtures, regression-tested):
- clean ATS resume
- `pdftotext -layout`-style layout
- LinkedIn copy (the failing case from the parity audit)
- notes / bullets only
- two-column PDF
- non-English headings: **English only in v1**, flagged as a risk

---

## 9. Job Match architecture

```
JD text → segment → extract terms → normalize → weight → compare with resume evidence → score + gaps + suggestions
```

- **Segment.** Detect JD sections: title/header, responsibilities, **required**
  ("requirements", "must", "you have"), **preferred** ("nice to have", "bonus", "preferred"), about
  the company.
- **Extract:**
  - (1) **Taxonomy match**: a bundled, versioned skills taxonomy (hard skills, tools, certifications,
    domains, soft skills) with aliases, e.g. `JS→JavaScript`, `k8s→Kubernetes`, `A/B testing` ≈
    `split testing`.
  - (2) **Phrase candidates**: noun phrases from requirement bullets (2–3 word n-grams that don't
    start or end with a stopword), filtered by an expanded stopword list and generic-term list
    (e.g. "nice", "team", "experience", "years", "5+").
- **Weight** = section weight (required 1.0, responsibilities 0.7, preferred 0.5, other 0.3)
  × frequency factor × type factor (taxonomy term > free phrase). Keep the top 12–20 terms
  (the spec asks the AI for 8–12 keywords).
- **Evidence.** Search the resume by normalized term and alias, with light stemming
  (manage/managed/management). Each match records **where** it appears (skills list, a specific
  bullet, summary).
- **Output** (the spec's shape plus evidence):
  - `jobTitle`
  - `matchPercent` (weighted coverage)
  - `matched[]` (with evidence location)
  - `missing[]` (weighted, marked required or preferred)
  - `suggestions[]`
  - the spec's honesty copy for missing terms.
- **Deterministic tailoring suggestions.** They never invent; each has current → suggested, a reason,
  and Accept / Reject / Review section, exactly as in the spec:
  1. A skill proven in a bullet but not in Skills → "Add *X* to Skills (shown in: <bullet>)".
  2. Reorder skills so JD-matched skills come first.
  3. The resume uses an alias and the JD uses the canonical name → "Use *Kubernetes* instead of *k8s*".
  4. The JD title term appears in experience but not in the tagline → suggest adding it to the
     tagline, drawn from the user's own title text.
- **Persistence.** The JD is saved as a `TargetJob` per resume (spec behavior). Results are recomputed.
- **Regression tests:** fixed JD/resume pairs with expected matched and missing sets, including the
  parity audit's case (must find `SQL`, `A/B testing`, `stakeholder management`; must not emit
  `nice` or `5+`; must recognize `user research` as matched).

---

## 10. Cover Letter architecture

- **Inputs** (spec: "only your resume and the target job description"): the `Resume`, its
  `TargetJob`, and the Job Match output. Optional overrides: hiring manager name, company, role.
- **JD extraction:**
  - company: "About <X>", "at <X>", "<X> is hiring", "Company: <X>"
  - role: first line / "Title:" / "Position:"
  - Any field that can't be found becomes a visible `[Company]` / `[Role]` placeholder.
- **Evidence selection.** Rank the user's bullets by weighted overlap with the JD terms. Take the top
  2–3 **verbatim**; skills come from `matched[]` only.
- **Composition.** Three tone templates (formal / concise / warm), each built from 4 paragraph
  templates: opening, fit, evidence, close. Sentence variants are chosen deterministically (seeded by
  resume + job id), so "Regenerate" cycles through variants.
- **Guarantee.** The only content that isn't a fixed template phrase comes from the resume or from
  the JD's company/title fields. This is enforced by a unit test (the deterministic equivalent of the
  spec's verification pass).
- **Output.** Editable text, saved as a `CoverLetter`. Copy, Share, and export as PDF/DOCX using the
  resume's header styling. **Open decision:** cover-letter export is not paywalled in the spec (the
  spec only offers copy). Proposal: keep it free and copy/share-only, matching the spec.

---

## 11. PDF / DOCX export architecture

```
ExportService.export(resumeId, templateId, format, paper)
  1. canExport(templateId, entitlements.snapshot())  → deny → open the Paywall(templateId)
  2. load Resume, validate
  3. PDF:  html = render(resume, template, {mode: 'pdf', paper})  → expo-print printToFileAsync
     DOCX: base64 = buildDocx(resume, template)                    → write file
  4. name file "<name>_<template>.pdf|docx" in the cache dir
  5. share sheet (Save to Files / Drive / Mail); delete stale export files on next launch
```

- **Fully offline.** No network at any step.
- **PDF:**
  - Letter (612×792 pt) or A4 (595×842 pt).
  - Margins 0.75 in: iOS `margins` option, Android `@page`.
  - Fonts embedded; text selectable.
  - `break-inside: avoid` on entries, and tested with a 3-page resume.
  - **Must be verified per platform** (iOS and Android print engines differ).
- **DOCX:** the spec's generator, unchanged in content (base64 output).
- The file is never produced while the template is locked. The watermark exists only in the preview,
  never in exported files.

---

## 12. Storage architecture

**Engine: `expo-sqlite`** (bundled in SDK 57), with WAL and versioned migrations.
AsyncStorage (used by the prototype) keeps everything as one JSON string and has size limits on
Android, so it is not suitable.

| Table | Contents |
|---|---|
| `resumes` | id, title, template_id, accent, data_json, schema_version, created_at, updated_at, deleted_at |
| `target_jobs` | id, resume_id, title, company, description, updated_at |
| `cover_letters` | id, resume_id, target_job_id, tone, body, updated_at |
| `entitlement_cache` | template_id, product_id, state, source, transaction_ref_hash, verified_at |
| `settings` | key, value (paper size, last-opened, onboarding flags) |
| `meta` | db_version |

**Writes:**
- Editor autosave is debounced (~400 ms) and runs as one transaction per resume.
- Changes are applied as functional updates, which fixes the prototype's stale-closure risk.

**User backup:**
- Settings → "Export all data" writes a versioned JSON backup (resumes, jobs, letters; **no
  entitlements**) through the share sheet.
- "Import backup" merges by id.
- This is the only way to guarantee recovery across reinstall and device changes without a server.

**OS backup:**
- iOS device backups (iCloud/Finder) include the app's container.
- Android Auto Backup is on by default in Expo (`allowBackup` defaults to true) and restores
  ≤25 MB of app data on reinstall **if the user has backup enabled**. Keep it on; exclude the export
  cache.

---

## 13. Security model

**Assets:**
- The user's resume data (personal information).
- The per-template export entitlement (a $5 item).

| Threat | Control | Residual |
|---|---|---|
| Free export of a locked template | `canExport` inside the export service; the preview is watermarked, non-selectable, JavaScript off, no print path | Screenshot of the watermarked preview (accepted) |
| Fake or replayed purchase, modified store response | Grants come **only** from the store provider's verified transactions (StoreKit 2 signed transactions / Play purchase state `PURCHASED` + acknowledged). The cache is written only by the provider | Depends on the provider choice: on-device verification < third-party (RevenueCat) < own verifier |
| Edited local data | The entitlement cache is refreshed from the store on launch and foreground when online, and **revocations/refunds overwrite it**. No user-editable "isPro" flag | Rooted/jailbroken devices can patch the app (accepted at $5; documented) |
| Pending / Ask-to-Buy | State `pending` never grants | — |
| Refund / revocation | Transaction listener + refresh → `revoked` → template locks again; already-exported files remain | Accepted |
| Resume privacy | No network, no analytics SDK, no AI; data stays in the app sandbox; export files in the cache dir are cleaned; the backup file is plain JSON and is labeled as containing personal data | The user controls where they share backups |
| Injection via resume content | All user text is HTML-escaped in the renderer; hex-only accent; the WebView has JS off and navigation blocked; the parser has input-size limits | — |
| Supply chain / AI creep | A CI test fails on any AI SDK, `fetch`, or network use outside the entitlement provider | — |

**Offline trust rule.** When the store can't be reached, the app trusts the **last store-derived
cache**. StoreKit 2 and the Play Store client also keep their own offline caches, which providers
query first. Loss of connectivity never removes access the user owns.

---

## 14. What happens when the app is offline

| Capability | Offline behavior |
|---|---|
| Create, edit, store, delete resumes | Works fully |
| Template gallery, selection, accent, paper size | Works (bundled fonts and thumbnails) |
| Preview | Works (watermarked if the template is not owned) |
| Import: paste, DOCX, text PDF | Works. Scanned PDF is unsupported, online or offline |
| Check, Coach, Job Match, Cover Letter | Works (all local) |
| Export PDF/DOCX for **owned** templates | Works (cached entitlement) |
| Export for **not-owned** templates | Paywall shows "Connect to the internet to buy". No price shown unless a cached offer exists |
| Purchase, restore | Unavailable, with a clear message. Nothing in the cache changes |
| Backup export/import | Works (local file) |

---

## 15. What happens after reinstall

1. **App data:**
   - iOS: deleted on uninstall unless the device is restored from a backup.
   - Android: may be restored by Auto Backup (if enabled, up to 25 MB).
   - Otherwise the library is empty and the user can use **Import backup** if they saved one.
2. **Purchases:** on first launch, `refresh()` silently queries the store's current entitlements.
   - It does not prompt for sign-in (StoreKit 2 current entitlements; Play `queryPurchases`).
   - Owned templates unlock automatically when online, with no user action needed.
   - If the store account differs or the silent query returns nothing, **Restore purchases** is
     available in the Paywall and in Settings (required by Apple).
3. **First-run messaging:** the empty library explains the backup option. (Recommend showing a
   "Back up your resumes" reminder after the 3rd resume or the first export.)

---

## 16. What happens after a purchase

1. The user taps Export on template T, or Unlock on a locked T.
2. The Paywall(T) shows the template preview, what's included ("PDF + Word for every resume using
   *T*, one-time"), the localized store price, Restore and Not now.
3. `purchase(T)` → store sheet → outcome:
   - **Purchased:** provider verifies → `finish` / **acknowledge** (Google refunds purchases that
     aren't acknowledged within 3 days) → cache `owned` → snapshot emitted → watermark disappears for
     T → **the original export continues automatically** in the requested format.
   - **Pending** (Ask to Buy, deferred payment): state `pending`, "We'll unlock *T* when the purchase
     completes". The transaction listener finalizes it later, even after an app restart.
   - **Cancelled:** nothing changes, no error.
   - **Failed:** readable error plus retry. Nothing is granted.
4. If the app crashes mid-purchase, the unfinished transaction is delivered by the transaction
   listener on next launch and processed the same way.

---

## 17. What happens when a purchase is restored

1. The user taps **Restore purchases** (Paywall or Settings). This needs the network.
2. `restore()` → `syncWithStore()` (may prompt the store sign-in) → returns all owned non-consumables.
3. Map product ids → template ids via the catalog. Unknown ids are ignored and recorded locally for
   diagnostics.
4. **Replace** the cache with the store's answer: newly owned → `owned`; previously cached but not
   returned → keep until the next successful refresh confirms it, then `revoked`. This avoids
   flicker from one failed call.
5. Show the result: "Restored: The Boardroom, The Builder", or "No purchases found for this store
   account".
6. Offline or error: message only, and the cache stays untouched.

---

## 18. Classification of the current `resume-mobile` (prototype)

| Module | Verdict | Reason |
|---|---|---|
| `src/lib/types.ts` | **REFACTOR** | `ResumeData` shape is correct (spec). Needs `schemaVersion`, `TargetJob`, `CoverLetter`, uuid ids; move to `domain/resume` |
| `src/lib/sample-data.ts` | **KEEP** | Verbatim spec content |
| `src/lib/templates.ts` | **REFACTOR** | 12 configs are verbatim spec. Add product ids and font metadata; move to `domain/templates` |
| `src/lib/text.ts` | **KEEP** | Escaping, hex validation, file names: small and correct |
| `src/lib/resume-score.ts` | **KEEP** | Spec rules verbatim (one null-safety fix); move to `domain/check` |
| `src/lib/render-html.ts` | **REFACTOR** | Right approach (single DOM-free renderer, escaping, watermark), but wrong fonts (Georgia vs Playfair/Jakarta) and no A4. Needs a rule-by-rule parity pass against `TemplateRenderer.tsx` |
| `src/lib/export-docx.ts` | **KEEP** | The spec's generator, with base64 output. Unverified under Hermes on device → verify |
| `src/lib/export.ts` | **REFACTOR** | Gating must become per-template via `EntitlementService`; add paper size and stale-file cleanup |
| `src/lib/parse-text.ts` | **REWRITE** | Fails LinkedIn-style input (merged roles, empty entries) and keeps layout spacing. No confidence, no unassigned bucket |
| `src/lib/job-match.ts` | **REWRITE** | Frequency-only. Emits noise ("nice", "5+"), misses core skills, no weights, title or evidence |
| `src/lib/cover-letter.ts` | **REWRITE** | Ignores the job description (the spec's core input) |
| `src/lib/access.ts` | **REWRITE** | Models a single global unlock. The spec is per-template. Its fail-closed idea carries over into `domain/entitlements` |
| `src/lib/purchases.tsx` | **DELETE** | RevenueCat-specific, global entitlement, wired straight into the UI. Violates "no vendor coupling" and "don't add RevenueCat yet" |
| `src/lib/store.tsx` | **REWRITE** | A single AsyncStorage JSON blob; stale-closure update pattern. Replace with SQLite repositories |
| `src/components/ui.tsx` | **REFACTOR** | Useful primitives. Move into `ui/` with tokens; keep the look (no unrelated redesign) |
| `src/app/_layout.tsx` | **REFACTOR** | New providers (DB, entitlements); add the error boundary |
| `src/app/index.tsx` | **REFACTOR** | Keep the library list. Add spec home content (value props, curated templates, start-from-template) |
| `src/app/import.tsx` | **REWRITE** | Paste only, no review step. It becomes the import flow (file + paste → review) |
| `src/app/resume/[id]/index.tsx` | **REFACTOR** | Section forms match the spec. Needs stable item keys, jump-to-section anchors, Coach hooks, repository-backed updates |
| `src/app/resume/[id]/preview.tsx` | **REFACTOR** | Keep the WebView and the hardening. Replace the accent palette with the spec's, add the custom color, category/description picker, per-template lock state and paper size |
| `src/app/resume/[id]/tools.tsx` | **REWRITE** | JD not persisted; no suggestions or jump-to-section; wrong cover-letter inputs |
| `src/app/unlock.tsx` | **REWRITE** | A global "unlock all" paywall with "All 12 templates" copy, which contradicts the commercial model. Becomes Paywall(templateId) |
| `src/__tests__/access.test.ts` | **REWRITE** | Tests the global model |
| `src/__tests__/parse-text.test.ts` | **REWRITE** | Moves to the corpus-based suite (section 8) |
| `src/__tests__/tools.test.ts` | **REFACTOR** | Keep the renderer escaping, accent-injection, DOCX-validity and **no-AI/no-network guard** tests. Replace the match and letter tests |
| `app.json` | **REFACTOR** | Real name, bundle ids and icons. Remove `com.android.vending.BILLING` until billing lands |
| `assets/*.png` | **DELETE** | Expo template placeholders |
| `eas.json` | **KEEP** | Standard profiles (no builds now) |
| `eslint.config.js`, `vitest.config.mts`, `tsconfig.json`, `AGENTS.md`, `CLAUDE.md` | **KEEP** | Tooling |
| `package.json` deps: `react-native-purchases`, `react-dom`, `react-native-web` | **DELETE** | Added only for RevenueCat's peer dependencies; there is no web target |
| `package.json` deps: `@react-native-async-storage/async-storage` | **DELETE** | Replaced by `expo-sqlite` |
| `README.md` | **REWRITE** | Describes the global-unlock/RevenueCat prototype |
| `PAYMENT_AUDIT.md` | **DELETE** (or archive) | About the web product, which is not being built |
| `MOBILE_PARITY_AUDIT.md` | **KEEP** (as history) | Evidence still valid. Its option-C decision is superseded by this plan |
| **Repo location** (`Cal-/resume-mobile`, inside the NutriVerify monorepo) | **Owner decision** | The product should live in its own repository. Moving it is a step-0 item |

**Tally:** KEEP 7 · REFACTOR 11 · REWRITE 11 · DELETE 5 (counting grouped rows once).
In practice: **keep the domain data and the renderer approach; rewrite the intelligence (parse,
match, letter), the storage, and everything payment-related.**

---

## 19. Migration order

Each step ends green: typecheck, lint, unit tests and the no-AI guard. Device QA gates are marked ◆.

| Step | Work | Exit criteria |
|---|---|---|
| 0 | Decisions: repo home, app name/spelling, bundle ids, the $4.99 price point, IAP provider choice (can wait until step 10). Brand assets | Written decisions |
| 1 | Restructure to `domain/ services/ features/ ui/`. Move KEEP modules; delete `purchases.tsx` and the RevenueCat, web and async-storage deps | Builds; tests pass |
| 2 | Domain model v1 + validation + migrations; SQLite repositories; library screen on SQLite | Resume CRUD works; migration tests |
| 3 | Entitlement abstraction + `FakeStoreProvider` + per-template `canExport`; per-template lock/watermark in preview; `Paywall(templateId)` UI using the fake | Scripted purchase/pending/revoke/offline tests |
| 4 | Renderer parity (fonts, rules, Letter/A4) + prebuilt thumbnails + gallery + picker + spec palette + custom color | ◆ Visual comparison against spec screenshots on iOS and Android |
| 5 | Export service (PDF/DOCX, share, cleanup) behind `canExport` | ◆ Multi-page PDF and DOCX open correctly on both platforms |
| 6 | Editor parity: stable keys, jump-to-section, empty hints; Check with "Improve" links | ◆ Editor usability pass |
| 7 | Writing Coach rules on the 5 field types | Rule unit tests; no-fact-insertion invariant |
| 8 | Import: parser rewrite + corpus, review screen, DOCX extraction, PDF (pdf.js WebView), error paths | Corpus thresholds met ◆ real files |
| 9 | Job Match engine + taxonomy + persistence + suggestions; then Cover Letter generator | Regression pairs pass; letter grounding test |
| 10 | **(Separate approval)** Real store provider(s); App Store Connect / Play Console products ×12; sandbox testing of purchase, pending, cancel, refund, restore, reinstall | ◆ Full purchase matrix on both stores |
| 11 | Backup export/import, settings, error boundary, accessibility, performance on low-end Android | ◆ Release-candidate QA |
| 12 | **(Separate approval)** EAS builds and store submission | — |

---

## 20. Major risks and failure modes

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Data loss** (reinstall, device change, cleared storage) with no server | Users lose resumes | Backup export/import; OS backup on; reminders |
| 2 | iOS vs Android **print differences** (fonts, margins, page breaks) | Exported PDF differs from preview | Embedded fonts; per-platform golden-file QA (step 4–5 ◆) |
| 3 | **Parser accuracy** on real-world resumes | Bad first impression on import | Review step + unassigned bucket + corpus; paste fallback |
| 4 | **PDF extraction** via pdf.js WebView: memory and performance on large or complex PDFs; no OCR | Slow or failed imports | 8 MB cap, page cap, timeout, clear fallback message |
| 5 | **Taxonomy coverage** / English-only | Weak match for niche roles or non-English JDs | Versioned taxonomy; phrase fallback; state the limitation. **Arabic/RTL resumes are unsupported by the spec's templates**, so the owner should decide on scope |
| 6 | **Non-AI UX feels weaker** than the spec's AI rewrite | Perceived quality drop | Honest copy; Coach with one-tap safe fixes; never claim AI |
| 7 | **Store price ≠ $5** (tiers, VAT-inclusive pricing, 15–30% commission) | Commercial mismatch | Owner approves the $4.99 tier; Small Business Program (15%) |
| 8 | **Play acknowledgement missed** (3-day auto-refund) | Revenue loss | Acknowledge in the provider; listener on launch; sandbox test |
| 9 | **Pending / Ask-to-Buy / family sharing / refunds** edge cases | Wrong lock state | Explicit states; revocation handling; test matrix (step 10) |
| 10 | **On-device-only verification** bypass on rooted devices | Revenue leakage | Accept at $5, or choose RevenueCat / a verifier in step 10 (the interface allows either) |
| 11 | 12 separate purchases feel expensive or confusing | Conversion | Paywall states the per-template scope clearly (the model is the owner's; no bundle added) |
| 12 | Expo SDK upgrades (WebView, print, SQLite APIs) | Breakage | Pin the SDK; upgrade with the golden-file suite |
| 13 | `docx` library under Hermes, and large base64 files | Export failure | Device verification in step 5; size guard |
| 14 | App Review: a paywall without Restore, or unclear digital-goods copy | Rejection | Restore in Paywall + Settings; clear per-template description |
| 15 | Prototype code carried over "because tests pass" | Hidden spec drift | This classification; parity checklist per step |

---

**Decisions needed from the owner before step 1:**
1. Repository home (move out of the NutriVerify monorepo?).
2. App name spelling (MY RUSEME vs MyResume) and bundle ids.
3. $4.99 price point.
4. Whether cover-letter export stays free and copy-only (proposed: yes).
5. Language scope (English only in v1?).

The IAP provider choice can wait until step 10.

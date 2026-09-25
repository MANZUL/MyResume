# Mobile parity audit: MANZUL/Resume (web) vs `resume-mobile/` (Expo)

**Scope.** I read every source file in `MANZUL/Resume` at commit `8e04af0`: all of `artifacts/`, `lib/`,
`scripts/`, `.agents/memory/`, the workspace config, and the product briefs in `attached_assets/`.
I did not re-read the ~50 generic shadcn `components/ui/*` files. I compared against `resume-mobile/`
at commit `58d35f7`. **This is an audit only. No app code was changed.**

**How to read the statuses.**
- The code is the source of truth. The briefs in `attached_assets/` are used only to understand intent.
- "FULL" means the mobile code implements the same behavior. It does **not** mean the behavior was
  seen working on a phone. **No part of `resume-mobile` has run on a simulator or device yet.**
  Passing typecheck, tests and bundling shows the code compiles. It does not show the features work.
- I tested the on-device replacements for AI features with realistic inputs. Their outputs are quoted
  in section 4.

---

## Summary

| | Count |
|---|---|
| Web features inventoried | **37** |
| FULL | **12** |
| PARTIAL | **4** |
| MISSING | **11** |
| REPLACED | **10** |
| BROKEN (in mobile) | **0** confirmed. Several paths are unverified on device (see 1.1) |

**Verdict.** `resume-mobile` is a **partial re-implementation**, not a mobile equivalent. The core
editor, the Word generator, the resume score and the template configs are the same code as the web
app. Everything the web app sells as "AI-assisted" is either missing or replaced by weaker
deterministic logic, and so are most of the landing, template-browsing and customization surfaces.
It also changed two business decisions that were not mine to make:
- **Pricing model.** The web app sells a $5 unlock per template (`payments.ts:25-33` filters on
  `templateId`). The mobile app sells one unlock for all templates at a store-set price
  (`unlock.tsx:10`).
- **Payment provider.** Dodo on the web, App Store / Google Play billing through RevenueCat on mobile.

---

## 1. Feature inventory

"Needs backend" says whether the **web** version needs a server, and whether an equivalent **mobile**
version would.

| # | Feature | Web implementation | Mobile implementation | Status | What was lost | Needs backend? |
|---|---|---|---|---|---|---|
| 1 | Landing / marketing page | `home.tsx:267-510`: hero, 3 steps, "method" section, price section ("$5 once"), final CTA | `app/index.tsx`: one headline and 3 buttons | PARTIAL | Value proposition, price disclosure, marketing copy | No |
| 2 | Hero live sample preview | `home.tsx:331-341` renders a scaled `TemplateRenderer` | none | MISSING | Visual first impression | No |
| 3 | Template gallery: thumbnails + category filter | `TemplateGallery.tsx`: "All + 6 categories", 12 live thumbnails | none | MISSING | Browsing templates visually before starting | No |
| 4 | Start from a chosen template | `home.tsx:202-212` loads the sample in that template | none. The sample always opens in template #1 | MISSING | "Pick a look first" entry path | No |
| 5 | Brand identity | "MY RUSEME" name, SVG logo mark (`home.tsx:282-287`), OG meta | Named "MyResume". No logo. `assets/*.png` are **Expo template placeholders** | MISSING | Brand, name consistency, store-ready icons | No |
| 6 | Upload a PDF/DOCX resume | `resume-upload.ts` (`pdftotext`, `unzip`) → `resume-parser.ts` (Claude) | none | MISSING | The primary hero CTA ("Upload my resume") | Web: yes (server binaries + AI). Mobile: DOCX could work on-device; PDF is hard |
| 7 | Paste text / LinkedIn / notes → structured draft | `/resumes/parse` → Claude, with source-grounding check | `parse-text.ts`: rule-based, on-device | REPLACED | Robustness. LinkedIn-style and layout-heavy text parse badly (see 4.2) | Web: yes (AI). Mobile: no |
| 8 | Create from scratch | `startBlank` | "New blank resume" | FULL | — | No |
| 9 | Sample resume | `SAMPLE_RESUME` | same data file | FULL | — | No |
| 10 | Auto-save working draft, restore on reload | `localStorage['resume-builder:working-draft']` (`home.tsx:89-113`) | AsyncStorage `resumes.v1`, all resumes | FULL | — | No |
| 11 | Save draft to server (create/update) | `POST /resumes`, `PATCH /resumes/:id`, scoped to the visitor cookie | none. Device only | REPLACED | Server copy, survives a browser reset | Yes |
| 12 | Saved drafts list / reopen | "Your Saved Drafts" (`home.tsx:458-475`), `GET /resumes` | Home list, stored locally. Adds duplicate and delete | REPLACED | Server-side list. Web drafts are not reachable from mobile | Web: yes |
| 13 | Personal info | 6 fields | same 6 fields | FULL | — | No |
| 14 | Summary: tagline, bullets, skills | yes | yes | FULL | — | No |
| 15 | Experience add/remove, all fields + bullets | yes | yes, plus reorder | FULL | — | No |
| 16 | Education | yes | yes | FULL | — | No |
| 17 | Certifications | yes | yes | FULL | — | No |
| 18 | Projects | yes | yes | FULL | — | No |
| 19 | Awards | yes | yes | FULL | — | No |
| 20 | "Improve with AI" (6 actions) on 5 field types | `AiImproveButton` (`ResumeEditor.tsx:112,174,189,286,301`): improve, concise, professional, impact, measurable, grammar | none | MISSING | In-context rewriting. The landing's "IMPROVE" promise | Web: yes (AI) |
| 21 | Job match analysis | `/resumes/ai` job-match: AI extracts 8–12 keywords, code computes matched/missing/%, plus job title | `job-match.ts`: word-frequency keywords, no job title | REPLACED | Keyword quality (see 4.3) and the job title | Web: yes (AI). Mobile: no |
| 22 | Target job description kept across sessions | saved in the local draft (`home.tsx:93`) | kept only in `tools.tsx` component state, lost when you leave the screen | MISSING | Tailoring continuity | No |
| 23 | Tailoring suggestions: accept / reject / review section | `ResumeTools.tsx:187-218`: grounded rewrites, applied only on Accept | none | MISSING | The "TAILOR" promise | Web: yes (AI) |
| 24 | Resume Check score | `resume-score.ts` (rule-based) | same file (one null-safety change) | FULL | — | No |
| 25 | Check → "Improve" jumps to the section | `ResumeTools.tsx:316`, `home.tsx:555-560` | none | MISSING | Actionable path from a warning to the field | No |
| 26 | Cover letter | Claude, from resume + **job description**, plus a second AI pass that checks claims; editable, copy, regenerate | `cover-letter.ts`: template filled from resume + company/role/manager fields. **Ignores the job description** | REPLACED | Job-specific letter; the input model differs | Web: yes (AI) |
| 27 | Render 12 templates | `TemplateRenderer.tsx` (React DOM + Tailwind). Serif font is **Playfair Display** (`index.css:1,83`) | `render-html.ts`: separate HTML-string renderer, serif is **Georgia** (`render-html.ts:8`) | PARTIAL | Typography differs from the web app on every serif template (9 of 12). Two renderers can drift apart | No |
| 28 | Template picker in editor: category tabs + descriptions | `home.tsx:578-616` | name-only chips (`preview.tsx`) | PARTIAL | Categories, descriptions | No |
| 29 | Accent preset colors | template default + 8 presets (`home.tsx:623`) | 8 **different** presets (`preview.tsx:13`) | PARTIAL | Same palette as web | No |
| 30 | Custom accent color picker | `<input type="color">` (`home.tsx:634-643`) | none | MISSING | Free color choice | No |
| 31 | Live preview next to the editor | split panel, updates as you type | separate Preview screen | REPLACED | Seeing changes while typing (reasonable on a phone) | No |
| 32 | PDF export | `window.print()`. The browser dialog lets the user pick Letter/A4 | `expo-print` → share sheet, **fixed to US Letter** (`export.ts:43`) | REPLACED | No A4 option | Web: no (client-side) |
| 33 | Word (.docx) export | `export-docx.ts` (client) | same generator, base64 → file → share | FULL | — (file write unverified on device) | No |
| 34 | Export access check | `GET /payments/status` (visitor + template + `paid`) | RevenueCat entitlement `exports` (`access.ts`) | REPLACED | Per-template scope | Web: yes |
| 35 | Purchase / checkout | `POST /payments/checkout` → Dodo hosted checkout, $5 per template | RevenueCat IAP, one unlock, store price | REPLACED | **Provider and pricing changed** | Web: yes. Mobile: store + RevenueCat |
| 36 | Unlock after payment | **Broken on web**: no webhook, nothing sets `paid` | Store purchase → entitlement active (unverified on device) | REPLACED | — (mobile works by design, web does not) | Web: yes |
| 37 | Crash fallback (error boundary) | `error-boundary.tsx`, used at root and per route | none | MISSING | Graceful failure screen | No |

**Mobile-only additions** (not in web, not counted): multiple local resumes, duplicate, delete, a
resume title field, reordering entries, a "PREVIEW" watermark, Restore purchases, and OS share sheet.

### 1.1 Unverified mobile paths (possible BROKEN, not confirmed)

None of these has been exercised on a device:
- `expo-print` output: iOS `margins` versus the Android `@page` margin, and the decorative marks at the page edge.
- `File.move` / `File.write(base64)` in `export.ts`.
- The WebView loading with `originWhitelist={['about:blank']}` (`preview.tsx:58`) on Android.
- RevenueCat purchase, restore and offline cached entitlement.
- `router.dismiss()` followed by `push` in `import.tsx`.

Until they are run on a device, they are unknowns, not FULL.

---

## 2. Screen / flow inventory

The web app has **one route** (`/`, `App.tsx`) that switches between a landing state and an editor
state, plus a 404. Everything else is sections, panels or tabs inside those two states.

| Area | Web (discovered in code) | Mobile | Status |
|---|---|---|---|
| Landing / home | Landing state: hero, steps, method, curated templates, paste box, saved drafts, price, CTA | `index.tsx`: headline, 3 CTAs, local list | PARTIAL |
| Onboarding | none (the landing acts as onboarding) | none | parity (both none) |
| Authentication | none. Anonymous `resume_visitor` httpOnly cookie, 1 year (`visitor-session.ts`) | none. Anonymous device + anonymous RevenueCat user | parity (both none) |
| Dashboard | "Your Saved Drafts" block on the landing | Home list | REPLACED |
| Upload flow | hidden file input → reading spinner → editor, or an error that points to paste | none | MISSING |
| Paste/import flow | "Build your resume" card → "Generate Draft" | `import.tsx` modal | REPLACED |
| Resume editor | left panel: header with Save/Close, Tools, section accordion | `resume/[id]/index.tsx` | FULL for fields, MISSING for AI actions |
| Sections | personal, summary & skills, experience, education, certifications, projects, awards | same 7 | FULL |
| Editor tools | tabs: Job Match, Check, Cover Letter, inside the editor panel | `resume/[id]/tools.tsx`, a separate screen | PARTIAL (see #21–26) |
| Templates | landing curated/gallery + editor category picker | chips on the Preview screen | PARTIAL |
| Customization | accent presets + custom color | presets only (different set) | PARTIAL |
| Preview | live side panel with responsive zoom (`index.css:136-166`) | `preview.tsx` WebView, fit to width | REPLACED |
| Export | floating ExportBar "Template access · $5" | buttons on the Preview screen | REPLACED |
| Payment | redirect to Dodo hosted page → `DODO_PAYMENTS_RETURN_URL`. **No return/success handling**: no polling, no success state | `unlock.tsx` modal: buy, restore, not now | REPLACED (web flow incomplete) |
| Account | none | none | parity |
| Settings | none | none | parity |
| Connectivity indicator | "Online / Connecting…" from `/healthz` | not applicable (no server) | n/a |
| 404 / error | NotFound page + ErrorBoundary | none | MISSING (error boundary) |
| Design canvas | `artifacts/mockup-sandbox`: Replit dev-only component preview, empty registry | — | not a product feature |

---

## 3. Backend dependency audit

| Dependency | Web detail | What happened in mobile |
|---|---|---|
| `GET /api/healthz` | status indicator | dropped (no server) |
| `POST /api/resumes/parse` | Claude parse; rate limit 10 per visitor / 30 per IP per 15 min | on-device rule-based parser |
| `POST /api/resumes/upload` | base64 upload ≤8 MB, magic-byte check, `pdftotext -layout` / `unzip -p word/document.xml`, then Claude | **dropped** |
| `POST /api/resumes/ai` improve | Claude + numeric-claim and token-grounding checks | **dropped** |
| `POST /api/resumes/ai` job-match | Claude keywords + suggestions; deterministic matched/missing | frequency keywords only; suggestions dropped |
| `POST /api/resumes/ai` cover-letter | Claude + second "grounded" check | template text |
| `GET/POST /api/resumes`, `GET/PATCH /api/resumes/:id` | Postgres drafts per visitor; no DELETE endpoint | AsyncStorage (plus local delete/duplicate) |
| `POST /api/payments/checkout` | Dodo `/checkouts`, inserts a `pending` entitlement | RevenueCat `purchasePackage` |
| `GET /api/payments/status` | checks for a `paid` row per visitor + template | RevenueCat `CustomerInfo.entitlements` |
| Database | Postgres/Neon via Drizzle: `resumes`, `export_entitlements`; `drizzle push` on every merge (`scripts/post-merge.sh`) | none |
| Authentication | none. Cookie is a bearer identity | none |
| Server actions | none (Express REST) | — |
| Env: `DATABASE_URL` | required | — |
| Env: `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `_BASE_URL` | **the client throws on import** (`integrations-anthropic-ai/src/client.ts`), and `routes/resumes.ts` imports it. If AI is not provisioned, **the whole API fails to start**, including drafts and payments | removed |
| Env: `DODO_PAYMENTS_API_KEY`, `_PRODUCT_ID`, `_RETURN_URL`, `_API_URL` | checkout returns 503 when missing | replaced by `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` (public keys) |
| Env: `DODO_PAYMENTS_WEBHOOK_SECRET` | **declared, never read** | n/a |
| Env: `PORT`, `NODE_ENV`, `BASE_PATH` | server + Vite | — |
| External services | Anthropic via the Replit AI proxy; Dodo; Neon; Google Fonts | RevenueCat, App Store / Google Play |
| Host binaries | `pdftotext` (poppler), `unzip` | — |
| File generation | PDF from browser print; DOCX in the browser | `expo-print` (PDF), `docx` (DOCX) on device |
| Storage | localStorage draft; cookie; Postgres | AsyncStorage only; app cache dir for export files |
| Rate limiting | in-memory `Map` per process. Autoscale deploys run several instances, so the limits are per instance | not applicable |

**Shared-code signal.** `lib/api-client-react/src/custom-fetch.ts` has `setBaseUrl` and
`setAuthTokenGetter`, documented "for Expo bundles". `pnpm-workspace.yaml` pins React "because expo
requires it". The web monorepo was scaffolded to host an Expo app **inside it**. `resume-mobile`
lives in a different repo (`Cal-`) and copies files instead of sharing them.

---

## 4. AI dependency audit

### 4.1 Where AI is used on the web

All calls go through `anthropic.messages.create` with model `claude-sonnet-5`, on the server only.

| # | AI use | File | Feature that depends on it | Can the feature work without AI? | Mobile today | Is the UX preserved? |
|---|---|---|---|---|---|---|
| A1 | Parse pasted text into `ResumeData` | `resume-parser.ts` | #7 | Partly. Rules handle clean, headed resumes | rule-based `parse-text.ts` | **No** for LinkedIn-style or layout-heavy text (4.2) |
| A2 | Parse uploaded file | `resume-upload.ts` + A1 | #6 | Text extraction needs no AI; structuring uses A1's rules | none | **No**: the feature is absent. DOCX could be done on-device (`jszip` is already bundled through `docx`). PDF text on-device needs pdf.js in a WebView: possible but heavy |
| A3 | Improve text: improve / concise / professional / impact / grammar | `resume-ai.ts:67-102` | #20 | **No** for rewriting quality. A deterministic lint (filler phrases like "responsible for", weak verb starts, capitalization, trailing punctuation) is a real but different feature | none | — |
| A3m | "Measurable" action | same | #20 | **Yes, mostly.** When a bullet has no number, the web returns a *question* asking for a metric. That is deterministic | none | could match |
| A4 | Job-match keyword extraction + job title | `resume-ai.ts:104-180` | #21 | Partly. A curated skills/tools dictionary plus phrase detection gets close; pure word frequency does not | word frequency | **No** (4.3) |
| A5 | Tailoring suggestions (grounded rewrites) | same | #23 | **No**. This is rewriting | none | — |
| A6 | Cover letter + claim-verification pass | `resume-ai.ts:182-219` | #26 | A template letter is a legitimate deterministic equivalent, **if it uses the job description** (company, title, overlapping keywords) as the web version does | template, ignores the JD | **No**: different inputs, generic output |

**Not AI** (and correctly carried over): the resume score (#24), the matched/missing math inside job
match, DOCX generation, and template rendering.

**Requirement: "mobile must not need AI".** Met. There is no AI SDK, no `fetch`, and a test enforces
this. **Requirement: "don't drop features just for no-AI".** Not met. #6 (upload) has a sensible
non-AI path (DOCX at least) and was dropped anyway. A3m (measurable question) and a deterministic
writing lint were never considered. #22 (JD persistence) and #25 (jump to section) are not AI
features and were still dropped.

Classification under the brief's rule ("design a deterministic equivalent only if it makes sense,
otherwise MISSING"):

| Feature | Deterministic equivalent makes sense? | Target status |
|---|---|---|
| Upload DOCX | yes | should be REPLACED, is MISSING |
| Upload PDF | questionable (weight, quality) | MISSING until decided |
| Improve (5 rewrite actions) | no | MISSING (correct) |
| "Measurable" prompt | yes | should be REPLACED |
| Job-match keywords | yes, with a skills dictionary | REPLACED (weak today) |
| Tailoring suggestions | no | MISSING (correct) |
| Cover letter | yes, JD-aware | REPLACED (not JD-aware today) |

### 4.2 Evidence: rule-based import (#7)

Tested on text shaped like `pdftotext -layout` output:
- Mostly right: name, email, phone, both roles, bullets, dates, skills, education.
- Wrong: the second company became `"Initech                         Austin"` (layout spacing kept)
  with location `"TX"`, and the first role's location lost its state (`"Seattle"`).

Tested on LinkedIn "copy profile" style text (the web explicitly invites "LinkedIn profile, or notes"):
- **Role 2 ("Marketing Manager, Fabrikam") was merged into role 1's summary**, as
  `"3 years 6 months Led brand relaunch. Marketing Manager Fabrikam"`.
- An **empty experience entry** was created with only dates.
- Education became degree `"MBA"`, and the field "Marketing" was dropped.

So the replacement works for clean resumes and fails on the second input shape the product advertises.

### 4.3 Evidence: job match (#21)

A realistic "Senior Product Manager, Growth" posting compared against the sample resume:
- **Picked as keywords:** `product, consumer, growth, management, 5+, a/b, amplitude, analytics, app,
  communication, data, design, engineering, experiments, go-to-market, manager, mobile, monetization,
  nice, onboarding`.
- **Noise:** `nice` (from "Nice to have"), `5+`, `app`, `manager`.
- **Not picked:** `SQL`, `A/B testing` (as a phrase), `stakeholder management`, `user research` (which
  *is* in the resume), `data science`, `subscription`.
- **Wrongly reported missing:** `management`, even though the resume says "managed" and "Product Strategy".

The web version's AI keyword step exists to avoid exactly this.

---

## 5. Payment security audit

Likelihood scale: **LIKELY** (a normal user can do it with a browser or a tip from a forum),
**POSSIBLE** (needs technical skill), **HARD** (needs root/jailbreak plus reverse engineering, or
breaking a third party's signing), **OUT OF SCOPE** (does not apply to that platform).

| Attack / scenario | Web | Mobile |
|---|---|---|
| Free user → PDF | **LIKELY**. Ctrl/Cmd+P prints `#print-area` with the app's own print CSS (`home.tsx:668-677`). No payment code is involved | **HARD**. Export is gated in `export.ts`; the preview is watermarked, non-selectable, JavaScript off. A screenshot gives a watermarked, low-resolution image |
| Free user → Word | **LIKELY**. The DOCX is built in the browser. Override the `/payments/status` response in DevTools, or call the bundled builder | **HARD** (needs a patched binary) |
| Paid user → PDF | **Fails.** The button stays locked forever (no `paid` row is ever written), so paying users fall back to Ctrl+P | works by design; **unverified on device** |
| Paid user → Word | **Fails.** A paying user is locked out | works by design; unverified |
| Replayed purchase | no webhook today, so n/a. **LIKELY once a webhook exists** unless `webhook-id` is deduplicated and the event is matched to its pending row | **HARD**. Receipts are validated by Apple/Google through RevenueCat. Restoring onto another device with the same store account is intended behavior |
| Fake purchase response | **LIKELY**. The client trusts a plain JSON boolean | **HARD**. Trusted Entitlements is on (`purchases.tsx:54`), and `FAILED` is rejected (`access.ts:46`) |
| Modified API response | **LIKELY** (same as above) | **HARD** (same). `NOT_REQUESTED` and `VERIFIED_ON_DEVICE` are accepted, which is fine unless the binary is patched |
| Modified local storage | **HARD / no effect**. localStorage holds only the draft. Swapping in another visitor's cookie inherits their purchases, but needs a stolen 122-bit UUID | **HARD**. AsyncStorage holds only resumes. The SDK cache sits in app-private storage (root needed) |
| Rooted / jailbroken device | OUT OF SCOPE | **POSSIBLE**: hook `resolveExportAccess` or patch the Hermes bundle. Accepted residual risk for a $5 item |
| Cleared cookies | **LIKELY loss for payers**: the purchase is bound to the cookie, and there is no restore | OUT OF SCOPE |
| Cleared app storage | OUT OF SCOPE | **LIKELY data loss**: every resume is gone (no backup or sync). The purchase is recoverable with Restore |
| Offline mode | PDF via Ctrl+P works offline (bypass). Status check fails, so exports are locked | Cached entitlement → paid export works offline. If there is **no cache** (fresh install, offline) → locked (`error`), a UX issue, not a hole |
| Reinstall | OUT OF SCOPE | Resumes lost unless the OS backup restores app data (not guaranteed). Purchase needs a manual Restore |
| Account switching | No accounts. Each browser is its own buyer | The entitlement follows the store account via Restore. Resumes stay on the device, whoever is signed in |
| RevenueCat entitlement manipulation | OUT OF SCOPE | Client-side: **HARD** (public SDK keys cannot grant entitlements). Ops risk: a dashboard mistake (promotional grants, a wrong product mapping). Dev builds without keys unlock (`__DEV__`); release builds without keys stay locked (tested) |
| Dodo webhook verification | **Does not exist.** A naive implementation that trusts `metadata.visitor_id` without verifying the signature lets anyone forge "paid" (**LIKELY**) | OUT OF SCOPE |
| Server-side verification | **None for exports.** The server never takes part in producing a file | None (no server). This is the root of the rooted-device risk above, and it is accepted |

**Other web risks:**
- AI endpoints are unauthenticated, and their rate limits live in an in-memory map per instance, so
  autoscaling multiplies the quota. Cost abuse is **POSSIBLE**.
- Checkout falls back to `crypto.randomUUID()` as the session ID (`payments.ts:115`), which creates
  entitlements a webhook can never match.

### 5.1 Recommended architecture (minimal)

**Web.** The web app must have a server anyway.
1. **Dodo webhook**: verify the signature on the raw body, reject stale timestamps, and handle each
   `webhook-id` only once. Mark the matching `pending` row `paid`, and handle refunds by reversing it.
   Stop falling back to a random session ID.
2. **Generate exports on the server**: `POST /api/exports/{pdf,docx}` loads the resume by id and
   visitor, checks the `paid` entitlement, and renders. DOCX uses the existing `docx` builder in Node.
   PDF uses headless Chromium on a **DOM-free HTML renderer**, which `resume-mobile/src/lib/render-html.ts`
   already is. Remove `window.print()` and the client-side DOCX builder.
3. Watermark the preview and hide `#print-area` in `@media print` until the user has paid. This is a
   deterrent only; step 2 is the actual protection.
4. Allow restore by the email that Dodo returns, so a purchase survives a cookie reset.

**Mobile.** No server needed:
- Keep store billing through RevenueCat with Trusted Entitlements, and do the entitlement check inside
  the export functions (as today).
- Accept the rooted-device risk. Closing it would need server-side export, which contradicts
  "works without a backend" and is not worth it at $5.
- **Owner decisions still open:**
  - (a) Mirror per-template pricing (12 store products) or keep one unlock.
  - (b) Allow cross-platform unlock (buy on web, use on mobile). This requires accounts, so it is out
    of scope for now.
  - (c) Whether a Dodo external-purchase link is allowed in the target storefronts. Apple's rules on
    external links changed for the US storefront in 2025 and differ by region. Store billing is the
    option that works everywhere.

---

## 6. Critical decision

**Recommendation: C. Extract the shared domain logic from the web app, then build mobile on top of it,
reusing the existing `resume-mobile` screens rather than rebuilding them.**

Reasons, from the code:
1. **The domain layer is already framework-free, and today it is copied, not shared.** `templates.ts`,
   `sample-data.ts`, `resume-score.ts`, `export-docx.ts` (builder) and the `ResumeData` types were
   copied into `resume-mobile`, and they have **already drifted**:
   - accent palette (`home.tsx:623` vs `preview.tsx:13`)
   - serif font (Playfair Display vs Georgia)
   - a second, independent template renderer
   - pricing semantics (per template vs global)

   Option A makes this worse with every change.
2. **The web repo was built to host an Expo app.** It has `api-client-react` with `setBaseUrl` and
   `setAuthTokenGetter` "for Expo bundles", and a pnpm catalog pinned for Expo. `resume-mobile`
   instead sits in an unrelated repo (`Cal-`, the NutriVerify monorepo), where it can share nothing.
3. **Option B is ruled out by the no-AI requirement.** Web architecture means calling the Express API.
   Every differentiating web feature there is an Anthropic call, the server **will not start without
   AI credentials** (`client.ts`), and identity is a browser cookie that does not suit native apps.
   Rebuilding mobile around that API reintroduces the dependencies you asked to remove.
4. **C also fixes the web's worst security gap.** Server-side export (5.1 step 2) needs a DOM-free
   template renderer, and `render-html.ts` is one. A shared `lib/resume-core` gives web (server export)
   and mobile (on-device export) a single renderer, docx builder, score, parser and job matcher.
   Features become shared by default. Only their AI-assisted versions stay web-only.

**Proposed shape, not implemented:**

```
Resume monorepo
  lib/resume-core      types, templates, sample, score, render-html, docx builder,
                       rule-based parser, keyword matcher (pure TS, no DOM, no RN)
  artifacts/api-server imports resume-core for server-side export
  artifacts/resume-builder imports resume-core
  artifacts/mobile     = resume-mobile moved in; screens kept
```

Cost to plan for: the React versions must be aligned. The pnpm catalog pins `react 19.1.0`, while
`resume-mobile` uses Expo SDK 57 with React 19.2.3.

---

## 7. Top gaps and issues

### 10 largest parity gaps
1. **Upload PDF/DOCX missing** (#6). It is the web's primary CTA. DOCX has a clear on-device path.
2. **Improve-with-AI missing** (#20) on 5 field types. The deterministic "measurable" prompt and a
   writing lint were not considered.
3. **Tailoring suggestions missing** (#23). The "TAILOR" promise is gone.
4. **Job match quality is materially worse** (#21, evidence in 4.3). The job title is also missing.
5. **The cover letter ignores the job description** (#26). The input model differs from the web.
6. **Paste import misparses LinkedIn-style text** (#7, evidence in 4.2), which the web advertises.
7. **Pricing model and payment provider were changed without an owner decision** (#34–35):
   per-template $5 on Dodo vs one unlock on the stores.
8. **No server or cloud save.** Web drafts are unreachable from mobile, and uninstalling or clearing
   data loses every resume (#11–12).
9. **Template discovery and customization are thinner**: no gallery, thumbnails, categories,
   descriptions, start-from-template or custom color; a different preset palette; a different serif
   font (#3, #4, #27–30).
10. **Not store-ready or resilient**: placeholder icons and splash, a different app name, no logo, no
    error boundary, JD not kept, no jump-to-section, PDF fixed to Letter (#5, #22, #25, #32, #37).
    **Nothing has been run on a device yet.**

### 5 largest security issues
1. **Web: free PDF with Ctrl+P.** LIKELY. The print CSS isolates the resume by design.
2. **Web: free Word by changing one JSON boolean** or calling the client-side builder. LIKELY.
3. **Web: no payment verification.** Paying users stay locked out. A future webhook without signature
   checks and idempotency would let anyone forge "paid". LIKELY.
4. **Web: purchases tied to an anonymous cookie** with no restore. Clearing cookies loses what was paid. LIKELY.
5. **Mobile: the gate is on the device only.** Rooted or jailbroken users can patch around it
   (POSSIBLE; accepted for $5). Related: resumes are stored only on the device and can be lost.

### Architecture recommendation
**Option C.** Build `lib/resume-core` in the Resume monorepo from the logic both apps already use.
Move `resume-mobile` in as `artifacts/mobile` and keep its screens. On the web, fix payments by adding
a signed, idempotent Dodo webhook and server-side export built on the shared renderer. On mobile, keep
on-device export gated by a store entitlement. The per-template pricing and Dodo-vs-store-billing
questions are for the owner, and should be answered before any more mobile payment work.

---

*The earlier documents in this folder (`README.md`, `PAYMENT_AUDIT.md`) describe the mobile app as
built. Where they suggest parity or state pricing ("All 12 templates, no subscription"), this audit
supersedes them.*

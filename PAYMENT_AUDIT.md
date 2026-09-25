# Payment verification audit: MANZUL/Resume (web app)

Audited commit `8e04af0`. Files: `artifacts/api-server/src/routes/payments.ts`,
`artifacts/resume-builder/src/components/preview/ExportBar.tsx`, `artifacts/resume-builder/src/pages/home.tsx`,
`artifacts/resume-builder/src/lib/export-docx.ts`, `lib/db/src/schema/resumes.ts`.

## Verdict

Anyone can get paid exports free, and people who actually pay never get access. The payment check
runs only in the browser, and no code on the server ever marks a payment as paid.

## Findings

### 1. Critical: the PDF paywall can be skipped with the browser's Print command
`home.tsx:661` does its PDF export with `window.print()`. The resume preview (`#print-area`) is always
fully rendered in the page, and the `@media print` CSS (`home.tsx:668-675`) hides the editor and prints
only the resume. So **Ctrl/Cmd+P → "Save as PDF"** gives the same clean PDF the $5 button sells, with no
payment. `ExportBar` is the only thing standing in the way, and it is just a button.

### 2. Critical: Word export is unlocked by one boolean in the browser
`ExportBar.tsx:19` runs the export when `paymentStatus?.hasExportAccess` is truthy. That value comes from
`GET /api/payments/status`, and `export-docx.ts` builds the .docx entirely in the browser. Changing the
response with DevTools "Override content", flipping the React state, or calling the bundled export
function directly produces the file. The server never takes part in an export, so it has nothing to enforce.

### 3. High: payments are never verified, so paying customers stay locked
`POST /payments/checkout` inserts `export_entitlements` rows with `status: "pending"`. **No code sets
`status = "paid"`.** There is no webhook route, and `DODO_PAYMENTS_WEBHOOK_SECRET` (in `.env.example`)
is never read. `/payments/status` only counts `paid` rows, so a real purchase never unlocks anything.

### 4. Medium: an entitlement can end up with a made-up session ID
`payments.ts:115` falls back to `crypto.randomUUID()` when Dodo's response has no `session_id` or `id`.
A webhook could never match that row. It is better to fail the checkout than to store an ID Dodo never issued.

### 5. Medium: purchases are tied to an anonymous cookie, with no way to restore
The `resume_visitor` cookie is the only proof of purchase. If the buyer clears cookies, uses another
browser, or switches device, the $5 is lost. There is no "restore by email" or order-ID lookup.

## Recommended fixes (in order)

1. **Add a webhook with signature verification.** Dodo signs webhooks in the Standard Webhooks format
   (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers). I could not reach Dodo's docs from
   this environment, so check the header and event names there before you ship. Verify the signature
   over the **raw body** with `DODO_PAYMENTS_WEBHOOK_SECRET` (for example, the `standardwebhooks`
   package), reject stale timestamps, and handle each `webhook-id` only once. When a payment succeeds,
   set the matching pending row (by checkout/session ID plus `metadata.visitor_id`) to `paid`. Handle
   refunds and disputes by setting it back.
2. **Generate exports on the server.** Add `POST /api/exports/{pdf|docx}`. It should load the resume by
   ID and visitor, check for a `paid` entitlement for that template, then render: the `docx` library
   works in Node, and PDF can come from headless Chromium rendering the same template. Remove
   `window.print()` and the bundled DOCX builder from the client.
3. **Stop the print shortcut for users who have not paid.** Watermark the preview, and until access is
   granted use `@media print { #print-area { display: none } }`. This stops casual use only. Fix 2 is
   the actual protection.
4. Make checkout fail when Dodo returns no ID (finding 4). Add restore-by-email using the customer email
   Dodo sends in the webhook (finding 5).

## The mobile app in this folder

`resume-mobile/` avoids findings 1–3 by design:
- Payment is a store in-app purchase. RevenueCat validates the receipt on its servers, and Trusted
  Entitlements signature checks are on.
- PDF and Word are generated only after the entitlement check inside `src/lib/export.ts`. The preview
  is watermarked and can't be printed, and it has JavaScript and text selection off.
- Release builds without purchase keys stay locked (fail closed). This is covered by `src/__tests__/access.test.ts`.

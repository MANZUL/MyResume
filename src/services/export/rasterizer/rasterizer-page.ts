// The offline page that turns the export PDF into PNG pages (plan §11, image).
//
// It embeds pdf.js (generated on install from pdfjs-dist, see scripts/pdfjs-source.mjs)
// and runs in a hidden WebView. It has no network access: the Content Security
// Policy allows only its own inline scripts, and pdf.js receives the PDF bytes
// directly. It rasterizes the same PDF that the PDF export produces, so the images
// match the PDF exactly.
//
// Protocol (JSON strings through window.ReactNativeWebView.postMessage):
//   page → app  { type: 'ready' }
//   app  → page window.__rasterize({ id, pdfBase64, scale, maxSidePx, maxPages })
//   page → app  { type: 'page', id, index, count, width, height, png }   one per page, in order
//               { type: 'done', id, count } | { type: 'error', id, message }

export interface PdfjsSources {
  main: string;
  worker: string;
}

/** Resolution and memory caps for image export. */
export const RASTER_LIMITS = {
  /** 3× the PDF's 72 dpi = 216 dpi, unless the longest side would exceed maxSidePx. */
  scale: 3,
  maxSidePx: 2400,
  /** A resume longer than this is refused rather than risking memory on low-end devices. */
  maxPages: 10,
} as const;

export const RASTERIZER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; " +
  "font-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

const PAGE_SCRIPT = `
const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
const decode = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
const PNG_PREFIX = 'data:image/png;base64,';
let running = false;
window.__rasterize = async (job) => {
  const { id, pdfBase64, scale, maxSidePx, maxPages } = job;
  if (running) {
    post({ type: 'error', id, message: 'busy' });
    return;
  }
  running = true;
  let task = null;
  try {
    task = globalThis.pdfjsLib.getDocument({
      data: decode(pdfBase64),
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      disableFontFace: false,
      stopAtErrors: true,
    });
    const doc = await task.promise;
    const count = doc.numPages;
    if (count < 1 || count > maxPages) throw new Error('page_limit:' + count);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const s = Math.min(scale, maxSidePx / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
      const url = canvas.toDataURL('image/png');
      if (!url.startsWith(PNG_PREFIX)) throw new Error('png_encoding_failed');
      post({ type: 'page', id, index: n - 1, count, width: canvas.width, height: canvas.height, png: url.slice(PNG_PREFIX.length) });
      // Release the bitmap before the next page.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    post({ type: 'done', id, count });
  } catch (error) {
    post({ type: 'error', id, message: String((error && error.message) || error).slice(0, 200) });
  } finally {
    running = false;
    if (task) task.destroy().catch(() => undefined);
  }
};
post({ type: 'ready' });
`;

function inlineScript(source: string): string {
  if (/<\/script|<!--|<script/i.test(source)) throw new Error('script cannot be inlined');
  return `<script type="module">${source}</script>`;
}

/** Builds the rasterizer page. Module scripts run in order: worker, pdf.js, then the page logic. */
export function buildRasterizerHtml(sources: PdfjsSources): string {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${RASTERIZER_CSP}">`,
    '<title>rasterizer</title></head><body>',
    inlineScript(sources.worker),
    inlineScript(sources.main),
    inlineScript(PAGE_SCRIPT),
    '</body></html>',
  ].join('');
}

let cached: Promise<string> | null = null;

/** The page with the bundled pdf.js. Loaded lazily (the source is large), once, on first image export. */
export function loadRasterizerHtml(): Promise<string> {
  cached ??= import('./pdfjs-source.generated').then(
    ({ PDFJS_MAIN, PDFJS_WORKER }) => buildRasterizerHtml({ main: PDFJS_MAIN, worker: PDFJS_WORKER }),
    (error: unknown) => {
      cached = null;
      throw error;
    },
  );
  return cached;
}

import { newId } from '../../../domain/shared/id';
import { RASTER_LIMITS } from './rasterizer-page';

// Connects the export platform to the hidden rasterizer WebView (RasterizerHost).
// The host mounts the WebView only while a job is running, so pdf.js and the page
// bitmaps are not kept in memory between exports. Every message from the page is
// validated: wrong job, wrong order, wrong count or a non-PNG payload fails the job.

export interface RasterPage {
  index: number;
  width: number;
  height: number;
  /** PNG file content, base64. */
  pngBase64: string;
}

export interface RasterizeOptions {
  scale?: number;
  maxSidePx?: number;
  maxPages?: number;
}

export interface Rasterizer {
  /** PDF (base64) → one PNG per page, in page order. */
  rasterize(pdfBase64: string, options?: RasterizeOptions): Promise<RasterPage[]>;
}

export class RasterizerError extends Error {
  constructor(readonly reason: string) {
    super(`Image export failed (${reason}).`);
    this.name = 'RasterizerError';
  }
}

/** What the host gives the bridge while its WebView is mounted. */
export interface RasterizerHostPort {
  run(script: string): void;
}

interface Job {
  id: string;
  payload: { id: string; pdfBase64: string; scale: number; maxSidePx: number; maxPages: number };
  pages: RasterPage[];
  resolve: (pages: RasterPage[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  started: boolean;
}

const PNG_BASE64_SIGNATURE = 'iVBORw0KGgo'; // \x89PNG\r\n\x1a\n

export interface RasterizerBridgeOptions {
  timeoutMs?: number;
  newId?: () => string;
}

export class RasterizerBridge implements Rasterizer {
  private job: Job | null = null;
  private port: RasterizerHostPort | null = null;
  private ready = false;
  private readonly listeners = new Set<() => void>();
  private readonly timeoutMs: number;
  private readonly makeId: () => string;

  constructor(options: RasterizerBridgeOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.makeId = options.newId ?? newId;
  }

  /** True while a job needs the WebView. */
  get active(): boolean {
    return this.job !== null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  rasterize(pdfBase64: string, options: RasterizeOptions = {}): Promise<RasterPage[]> {
    if (this.job) return Promise.reject(new RasterizerError('busy'));
    if (typeof pdfBase64 !== 'string' || !pdfBase64) return Promise.reject(new RasterizerError('empty_pdf'));
    return new Promise<RasterPage[]>((resolve, reject) => {
      const id = this.makeId();
      this.job = {
        id,
        payload: {
          id,
          pdfBase64,
          scale: options.scale ?? RASTER_LIMITS.scale,
          maxSidePx: options.maxSidePx ?? RASTER_LIMITS.maxSidePx,
          maxPages: options.maxPages ?? RASTER_LIMITS.maxPages,
        },
        pages: [],
        resolve,
        reject,
        timer: setTimeout(() => this.finish(new RasterizerError('timeout')), this.timeoutMs),
        started: false,
      };
      try {
        this.notify();
        this.start();
      } catch {
        this.finish(new RasterizerError('host_error')); // never leave a job stuck
      }
    });
  }

  /** Called by the host when its WebView is mounted. */
  attach(port: RasterizerHostPort): void {
    this.port = port;
    this.ready = false;
  }

  /** Called by the host when its WebView goes away. A running job fails. */
  detach(): void {
    this.port = null;
    this.ready = false;
    if (this.job?.started) this.finish(new RasterizerError('host_gone'));
  }

  /** The WebView failed to load or its process died. */
  fail(reason: string): void {
    if (this.job) this.finish(new RasterizerError(reason));
  }

  handleMessage(raw: unknown): void {
    let message: Record<string, unknown>;
    try {
      message = typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      this.ready = true;
      this.start();
      return;
    }
    const job = this.job;
    if (!job || message.id !== job.id) return; // stale or foreign message
    switch (message.type) {
      case 'page': {
        const { index, count, width, height, png } = message;
        const max = job.payload.maxSidePx + 1;
        const valid =
          index === job.pages.length &&
          Number.isInteger(count) && (count as number) >= 1 && (count as number) <= job.payload.maxPages &&
          Number.isInteger(width) && (width as number) > 0 && (width as number) <= max &&
          Number.isInteger(height) && (height as number) > 0 && (height as number) <= max &&
          typeof png === 'string' && png.startsWith(PNG_BASE64_SIGNATURE);
        if (!valid) {
          this.finish(new RasterizerError('invalid_page'));
          return;
        }
        job.pages.push({ index: index as number, width: width as number, height: height as number, pngBase64: png as string });
        return;
      }
      case 'done':
        if (message.count !== job.pages.length || job.pages.length === 0) this.finish(new RasterizerError('page_count_mismatch'));
        else this.finish(null);
        return;
      case 'error':
        this.finish(new RasterizerError(String(message.message ?? 'unknown').slice(0, 80)));
        return;
    }
  }

  private start(): void {
    const job = this.job;
    if (!job || job.started || !this.port || !this.ready) return;
    job.started = true;
    this.port.run(`window.__rasterize(${JSON.stringify(job.payload)});true;`);
  }

  private finish(error: Error | null): void {
    const job = this.job;
    if (!job) return;
    clearTimeout(job.timer);
    this.job = null;
    if (error) job.reject(error);
    else job.resolve(job.pages);
    this.notify(); // the host unmounts the WebView
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A failing listener must not block the others.
      }
    }
  }
}

let shared: RasterizerBridge | null = null;

/** The app's single bridge, shared by the export platform and the host. */
export function getRasterizerBridge(): RasterizerBridge {
  shared ??= new RasterizerBridge();
  return shared;
}

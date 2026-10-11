import { defaultPaperSize } from '../../domain/export/paper-default';
import type { PaperSize } from '../../domain/render/render-html';
import { deviceLocaleTags } from '../i18n/device-language';

// Screens take the type from here: they never import the renderer module directly.
export type { PaperSize };

// The selected paper size for exports. It lives in memory for the running app only: it is
// not written to the database (no schema change), so after a restart the default below
// applies again. One value serves PDF, Word and image export, so a single export never mixes sizes.

let chosen: PaperSize | null = null;

/** The user's choice in this session, else the default for the device's region. */
export function getPaperSize(): PaperSize {
  return chosen ?? defaultPaperSize(deviceLocaleTags());
}

export function setPaperSize(size: PaperSize): void {
  chosen = size;
}

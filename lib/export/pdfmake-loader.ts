import type { TDocumentDefinitions } from 'pdfmake/interfaces'

/** Minimal slice of the pdfmake browser API our exporters rely on. */
export interface PdfMakeInstance {
  createPdf(def: TDocumentDefinitions): { download(filename: string): void }
  addVirtualFileSystem(vfs: Record<string, string>): void
}

/**
 * Memoised loader for pdfmake. We dynamic-import the library (~1MB of font
 * data lives in `vfs_fonts`) so users who never export don't pay for it on
 * first paint, and we cache the result because pdfmake registers fonts on
 * a process-global singleton. Re-running setup on every click is wasted
 * work. The cache lives for the page-load lifetime of the SPA.
 *
 * This module is the single owner of pdfmake setup so every exporter
 * (shifts, audit, ...) shares the same registration and chunk.
 */
let pdfMakePromise: Promise<PdfMakeInstance> | null = null

async function load(): Promise<PdfMakeInstance> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  // `vfs_fonts` is a CJS module: `module.exports = { 'Roboto-Regular.ttf': '<base64>', ... }`.
  // Webpack wraps that object under `.default` when it's dynamic-imported as ESM.
  // Note: `pdfMake.vfs = ...` is a silent no-op in pdfmake 0.3.x. `addVirtualFileSystem`
  // is the supported entry point and writes into pdfmake's internal vfs.
  const fonts =
    (vfsMod as { default?: Record<string, string> }).default ??
    (vfsMod as unknown as Record<string, string>)
  const pdfMake = pdfMakeMod.default as unknown as PdfMakeInstance
  pdfMake.addVirtualFileSystem(fonts)
  return pdfMake
}

export async function getPdfMake(): Promise<PdfMakeInstance> {
  if (!pdfMakePromise) {
    pdfMakePromise = load().catch((err) => {
      // Allow a retry on the next call if the first load failed (e.g. transient
      // chunk load error after a deploy). Without this, a single failure would
      // permanently disable PDF export for the rest of the page-load.
      pdfMakePromise = null
      throw err
    })
  }
  return pdfMakePromise
}

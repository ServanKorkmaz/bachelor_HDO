import { format } from 'date-fns'
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'

/** Minimal shape this module needs from a Shift. Keeps the export layer
 * decoupled from the full Prisma type so it can be reused for any "shift-ish"
 * row we eventually want to print. */
export interface ShiftForExport {
  date: string                  // YYYY-MM-DD
  startDateTime: string | Date  // ISO timestamp
  endDateTime: string | Date    // ISO timestamp
  user: { name: string }
  shiftType: { label: string; code: string }
  comment?: string | null
}

export interface PdfMetadata {
  teamName: string
  dateFrom: string  // YYYY-MM-DD
  dateTo: string    // YYYY-MM-DD
  generatedAt?: Date
}

const HEADER_FILL = '#1e3a8a'  // matches the app's blue
const HEADER_TEXT = '#ffffff'

/**
 * Build a pdfmake document definition for a list of shifts. Pure function —
 * no IO, no browser APIs — so it can be unit-tested without spinning up
 * pdfmake's runtime.
 *
 * Layout: A4 landscape, one row per shift, sorted by date then assignee.
 * Landscape gives the comment column enough room without cramping times.
 */
export function buildShiftPdf(
  shifts: ShiftForExport[],
  meta: PdfMetadata
): TDocumentDefinitions {
  const sorted = [...shifts].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.user.name.localeCompare(b.user.name, 'no')
  })

  const tableBody: TableCell[][] = [
    [
      { text: 'Dato', style: 'th' },
      { text: 'Ansatt', style: 'th' },
      { text: 'Vakttype', style: 'th' },
      { text: 'Start', style: 'th' },
      { text: 'Slutt', style: 'th' },
      { text: 'Kommentar', style: 'th' },
    ],
    ...sorted.map((shift): TableCell[] => [
      shift.date,
      shift.user.name,
      shift.shiftType.label,
      format(new Date(shift.startDateTime), 'HH:mm'),
      format(new Date(shift.endDateTime), 'HH:mm'),
      shift.comment ?? '',
    ]),
  ]

  const generated = meta.generatedAt ?? new Date()

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 48, 32, 48],
    defaultStyle: { fontSize: 9 },
    info: {
      title: `Vaktplan ${meta.teamName} ${meta.dateFrom}–${meta.dateTo}`,
      creator: 'HDO Turnusplan',
    },
    content: [
      { text: 'Vaktplan', style: 'h1' },
      {
        text: `${meta.teamName} · ${meta.dateFrom} til ${meta.dateTo}`,
        style: 'subtitle',
      },
      {
        text: `Generert ${format(generated, 'dd.MM.yyyy HH:mm')} · ${sorted.length} vakt${sorted.length === 1 ? '' : 'er'}`,
        style: 'meta',
        margin: [0, 0, 0, 16],
      },
      sorted.length === 0
        ? { text: 'Ingen vakter i valgt periode.', style: 'empty' }
        : {
            table: {
              headerRows: 1,
              widths: [60, '*', 70, 40, 40, '*'],
              body: tableBody,
            },
            layout: {
              fillColor: (rowIndex: number) =>
                rowIndex === 0 ? HEADER_FILL : rowIndex % 2 === 0 ? '#f8fafc' : null,
              hLineColor: () => '#e2e8f0',
              vLineColor: () => '#e2e8f0',
            },
          },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 11, color: '#475569' },
      meta: { fontSize: 9, color: '#64748b' },
      empty: { italics: true, color: '#64748b' },
      th: { bold: true, color: HEADER_TEXT, margin: [0, 2, 0, 2] },
    },
  }
}

/** Minimal slice of the pdfmake browser API this module relies on. */
interface PdfMakeInstance {
  createPdf(def: TDocumentDefinitions): { download(filename: string): void }
  addVirtualFileSystem(vfs: Record<string, string>): void
}

/**
 * Memoised loader for pdfmake. We dynamic-import the library (~1MB of font
 * data lives in `vfs_fonts`) so users who never export don't pay for it on
 * first paint, and we cache the result because pdfmake registers fonts on
 * a process-global singleton — re-running setup on every click is wasted
 * work. The cache lives for the page-load lifetime of the SPA.
 */
let pdfMakePromise: Promise<PdfMakeInstance> | null = null

async function loadPdfMake(): Promise<PdfMakeInstance> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  // `vfs_fonts` is a CJS module: `module.exports = { 'Roboto-Regular.ttf': '<base64>', ... }`.
  // Webpack wraps that object under `.default` when it's dynamic-imported as ESM.
  // Note: `pdfMake.vfs = ...` is a silent no-op in pdfmake 0.3.x — `addVirtualFileSystem`
  // is the supported entry point and writes into pdfmake's internal vfs.
  const fonts =
    (vfsMod as { default?: Record<string, string> }).default ??
    (vfsMod as unknown as Record<string, string>)
  const pdfMake = pdfMakeMod.default as unknown as PdfMakeInstance
  pdfMake.addVirtualFileSystem(fonts)
  return pdfMake
}

/**
 * Build the document and trigger a browser download. Safe to call repeatedly;
 * pdfmake and its fonts are loaded and registered exactly once per page-load.
 */
export async function downloadShiftPdf(
  shifts: ShiftForExport[],
  meta: PdfMetadata,
  filename: string,
): Promise<void> {
  if (!pdfMakePromise) {
    pdfMakePromise = loadPdfMake().catch((err) => {
      // Allow a retry on the next click if the first load failed (e.g. transient
      // chunk load error after a deploy). Without this, a single failure would
      // permanently disable PDF export for the rest of the page-load.
      pdfMakePromise = null
      throw err
    })
  }
  const pdfMake = await pdfMakePromise
  pdfMake.createPdf(buildShiftPdf(shifts, meta)).download(filename)
}

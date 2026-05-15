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

/**
 * Lazy-load pdfmake (it ships ~1MB of font data) and trigger a download.
 * Anything that wants this on screen pulls it via dynamic import so it stays
 * out of the initial bundle for users who never click "Last ned".
 */
export async function downloadShiftPdf(
  shifts: ShiftForExport[],
  meta: PdfMetadata,
  filename: string
): Promise<void> {
  const [{ default: pdfMake }, fontsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  // pdfmake 0.3.x stores fonts in an internal singleton — assigning `.vfs`
  // is a no-op; the supported API is `addVirtualFileSystem(vfs)`. The fonts
  // module shape varies (top-level keys, `.vfs`, `.pdfMake.vfs`, or wrapped
  // in `.default` by the bundler), so collect every candidate that looks
  // like `{ 'Roboto-*.ttf': base64 }` and register them all.
  const m = fontsModule as Record<string, unknown> & {
    default?: unknown
    pdfMake?: { vfs?: Record<string, string> }
    vfs?: Record<string, string>
  }
  const isVfs = (v: unknown): v is Record<string, string> => {
    if (!v || typeof v !== 'object') return false
    const keys = Object.keys(v as object)
    return keys.length > 0 && keys.some((k) => k.endsWith('.ttf'))
  }
  const candidates: unknown[] = [
    m.pdfMake?.vfs,
    m.vfs,
    (m.default as { vfs?: unknown })?.vfs,
    m.default,
    m,
  ]
  const merged: Record<string, string> = {}
  for (const c of candidates) {
    if (!isVfs(c)) continue
    for (const [k, v] of Object.entries(c)) {
      if (k.endsWith('.ttf') && typeof v === 'string' && v.length > 0) {
        merged[k] = v
      }
    }
  }
  const pm = pdfMake as unknown as {
    vfs?: Record<string, string>
    addVirtualFileSystem?: (vfs: Record<string, string>) => void
  }
  if (Object.keys(merged).length === 0) {
    throw new Error('pdfmake fonts not found: vfs_fonts module did not expose any *.ttf entries')
  }
  if (typeof pm.addVirtualFileSystem === 'function') {
    pm.addVirtualFileSystem(merged)
  } else {
    pm.vfs = merged
  }

  const docDefinition = buildShiftPdf(shifts, meta)
  pdfMake.createPdf(docDefinition).download(filename)
}

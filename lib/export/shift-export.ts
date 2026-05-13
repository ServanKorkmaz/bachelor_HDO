import { format } from 'date-fns'
import { downloadCsv } from './csv'
import { downloadShiftPdf, type ShiftForExport, type PdfMetadata } from './shift-pdf'

/**
 * Single source of truth for what a "shift row" looks like when exported.
 * CSV and PDF derive their columns from the same accessor functions so the
 * two formats can never drift out of sync.
 */

interface ExportRange {
  dateFrom: string
  dateTo: string
  teamName: string
}

const CSV_COLUMNS = [
  { header: 'Dato', accessor: (s: ShiftForExport) => s.date },
  { header: 'Ansatt', accessor: (s: ShiftForExport) => s.user.name },
  { header: 'Vakttype', accessor: (s: ShiftForExport) => s.shiftType.label },
  { header: 'Start', accessor: (s: ShiftForExport) => format(new Date(s.startDateTime), 'HH:mm') },
  { header: 'Slutt', accessor: (s: ShiftForExport) => format(new Date(s.endDateTime), 'HH:mm') },
  { header: 'Kommentar', accessor: (s: ShiftForExport) => s.comment ?? '' },
] as const

/** Slugify a team name + date range into a filename-safe stem. */
function buildFilenameStem(range: ExportRange): string {
  const slug = range.teamName
    .toLowerCase()
    .replace(/[æå]/g, 'a')
    .replace(/[ø]/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `vaktplan-${slug}-${range.dateFrom}-${range.dateTo}`
}

export async function exportShiftsCsv(
  shifts: ShiftForExport[],
  range: ExportRange
): Promise<void> {
  const sorted = [...shifts].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.user.name.localeCompare(b.user.name, 'no')
  })
  await downloadCsv(sorted, [...CSV_COLUMNS], `${buildFilenameStem(range)}.csv`)
}

export async function exportShiftsPdf(
  shifts: ShiftForExport[],
  range: ExportRange
): Promise<void> {
  const meta: PdfMetadata = {
    teamName: range.teamName,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  }
  await downloadShiftPdf(shifts, meta, `${buildFilenameStem(range)}.pdf`)
}

export type { ShiftForExport }

import { format } from 'date-fns'
import { nb } from 'date-fns/locale/nb'
import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'

/** Display row passed in from the audit page. Pre-translated and joined so
 * this module stays free of business logic. Its only job is layout. */
export interface AuditPdfRow {
  /** Pre-formatted "dd.MM.yyyy HH:mm". Date logic stays at the caller. */
  timestamp: string
  actor: string
  action: string
  entityType: string
  entity: string
}

export interface AuditPdfMetadata {
  /** Lower bound of the included period (YYYY-MM-DD). Empty string = no filter. */
  dateFrom: string
  /** Upper bound of the included period (YYYY-MM-DD). Empty string = no filter. */
  dateTo: string
  /** Pre-translated label like "Alle" / "Ferie" / "Vaktbytte". */
  entityFilterLabel: string
  /** Name of the user who triggered the download. Recorded so the PDF is
   * itself self-documenting if it gets archived or shared as evidence. */
  downloadedBy: string
  generatedAt?: Date
}

const HEADER_FILL = '#1e3a8a'
const HEADER_TEXT = '#ffffff'

/**
 * Build a pdfmake document definition for the audit log. Pure function
 * with no IO and no pdfmake runtime, so it can be unit-tested without
 * spinning up the font system.
 *
 * A4 landscape because the entity column needs the horizontal room. Header
 * carries the period, filter, and "downloaded by" so an archived copy of the
 * PDF still answers basic chain-of-custody questions years later.
 */
export function buildAuditPdf(
  rows: AuditPdfRow[],
  meta: AuditPdfMetadata,
): TDocumentDefinitions {
  const tableBody: TableCell[][] = [
    [
      { text: 'Dato og tid', style: 'th' },
      { text: 'Utført av', style: 'th' },
      { text: 'Handling', style: 'th' },
      { text: 'Entitet-type', style: 'th' },
      { text: 'Entitet', style: 'th' },
    ],
    ...rows.map((row): TableCell[] => [
      row.timestamp,
      row.actor,
      row.action,
      row.entityType,
      row.entity,
    ]),
  ]

  const generated = meta.generatedAt ?? new Date()
  const periodText =
    meta.dateFrom && meta.dateTo
      ? `${meta.dateFrom} til ${meta.dateTo}`
      : meta.dateFrom
        ? `fra ${meta.dateFrom}`
        : meta.dateTo
          ? `til ${meta.dateTo}`
          : 'hele perioden'

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 56, 32, 48],
    defaultStyle: { fontSize: 9 },
    info: {
      title: `Revisjonslogg ${meta.dateFrom || ''}–${meta.dateTo || ''}`.trim(),
      creator: 'HDO Turnusplan',
    },
    content: [
      { text: 'Revisjonslogg', style: 'h1' },
      { text: `Periode: ${periodText}`, style: 'subtitle' },
      { text: `Filter: ${meta.entityFilterLabel}`, style: 'subtitle' },
      {
        text:
          `Generert ${format(generated, 'dd.MM.yyyy HH:mm', { locale: nb })}` +
          ` av ${meta.downloadedBy} · ${rows.length} hendelse${rows.length === 1 ? '' : 'r'}`,
        style: 'meta',
        margin: [0, 0, 0, 16],
      },
      rows.length === 0
        ? { text: 'Ingen hendelser i valgt periode.', style: 'empty' }
        : {
            table: {
              headerRows: 1,
              widths: [80, 90, 110, 70, '*'],
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
    footer: (currentPage: number, pageCount: number) => ({
      text: `Side ${currentPage} av ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#64748b',
      margin: [0, 16, 0, 0],
    }),
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 10, color: '#475569' },
      meta: { fontSize: 9, color: '#64748b' },
      empty: { italics: true, color: '#64748b' },
      th: { bold: true, color: HEADER_TEXT, margin: [0, 2, 0, 2] },
    },
  }
}

/**
 * Build the document and trigger a browser download. Reuses the cached
 * pdfmake instance from the shift-pdf module so we only pay the ~1MB font
 * load once across the whole app.
 */
export async function downloadAuditPdf(
  rows: AuditPdfRow[],
  meta: AuditPdfMetadata,
  filename: string,
): Promise<void> {
  const { getPdfMake } = await import('./pdfmake-loader')
  const pdfMake = await getPdfMake()
  pdfMake.createPdf(buildAuditPdf(rows, meta)).download(filename)
}

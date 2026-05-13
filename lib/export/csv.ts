/**
 * Build a CSV string from a list of rows and a column definition. We don't
 * pull in papaparse for this because we never *parse* CSV — we only write it,
 * and a parser library is overkill for a 30-line function. RFC 4180 quoting
 * rules are enforced so values containing commas, quotes, or newlines survive
 * a round-trip through Excel, Google Sheets, and Numbers.
 *
 * Why semicolon-by-default? Norwegian Excel uses semicolon as its native
 * separator because comma is the decimal mark; using comma here would split
 * "8,5 timer" into two cells. Callers can override via `options.delimiter`.
 */

export interface CsvColumn<TRow> {
  header: string
  accessor: (row: TRow) => string | number | null | undefined
}

export interface CsvOptions {
  /** Field separator. Defaults to ';' for Norwegian Excel compatibility. */
  delimiter?: string
  /** Line separator. Defaults to '\r\n' per RFC 4180. */
  newline?: string
}

/** Escape a single CSV cell per RFC 4180: wrap in quotes if it contains the
 * delimiter, a quote, or a newline; double any embedded quotes. */
function escapeCell(value: string | number | null | undefined, delimiter: string): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  const needsQuoting = str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')
  if (!needsQuoting) return str
  return `"${str.replace(/"/g, '""')}"`
}

export function toCsv<TRow>(
  rows: TRow[],
  columns: CsvColumn<TRow>[],
  options: CsvOptions = {}
): string {
  const delimiter = options.delimiter ?? ';'
  const newline = options.newline ?? '\r\n'

  const headerRow = columns.map((c) => escapeCell(c.header, delimiter)).join(delimiter)
  const dataRows = rows.map((row) =>
    columns.map((c) => escapeCell(c.accessor(row), delimiter)).join(delimiter)
  )

  return [headerRow, ...dataRows].join(newline)
}

/**
 * Convenience wrapper: build the CSV string and hand it to the browser as a
 * download. Prefixes a UTF-8 BOM so Excel on Windows opens æøå correctly.
 */
export async function downloadCsv<TRow>(
  rows: TRow[],
  columns: CsvColumn<TRow>[],
  filename: string,
  options?: CsvOptions
): Promise<void> {
  const { downloadBlob } = await import('./download')
  const csv = toCsv(rows, columns, options)
  // BOM makes Excel detect UTF-8; without it, æ/ø/å render as garbage in
  // Norwegian Excel.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

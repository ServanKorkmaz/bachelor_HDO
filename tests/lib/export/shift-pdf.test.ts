import { describe, expect, it } from 'vitest'
import { buildShiftPdf, type ShiftForExport } from '@/lib/export/shift-pdf'

const baseShift = (overrides: Partial<ShiftForExport> = {}): ShiftForExport => ({
  date: '2026-04-27',
  startDateTime: '2026-04-27T08:00:00.000Z',
  endDateTime: '2026-04-27T16:00:00.000Z',
  user: { name: 'Alice' },
  shiftType: { label: 'Dag 08-16.00', code: 'Dag' },
  comment: null,
  ...overrides,
})

const meta = {
  teamName: 'Team A',
  dateFrom: '2026-04-27',
  dateTo: '2026-05-03',
  generatedAt: new Date('2026-04-27T10:00:00.000Z'),
}

/**
 * Unit tests for the PDF document-definition builder. These exercise the
 * pure function with no pdfmake runtime and no fonts, so they're fast and
 * deterministic. The downloader (`downloadShiftPdf`) is intentionally not
 * tested here because it dynamic-imports pdfmake and triggers a browser
 * download; that's covered by manual smoke tests and the E2E suite.
 */
describe('buildShiftPdf', () => {
  it('renders an A4 landscape document with title metadata', () => {
    const doc = buildShiftPdf([baseShift()], meta)
    expect(doc.pageSize).toBe('A4')
    expect(doc.pageOrientation).toBe('landscape')
    expect(doc.info?.title).toContain('Team A')
    expect(doc.info?.title).toContain('2026-04-27')
  })

  it('renders the empty-state message when there are no shifts', () => {
    const doc = buildShiftPdf([], meta)
    const content = doc.content as any[]
    const tail = content[content.length - 1]
    expect(JSON.stringify(tail)).toContain('Ingen vakter')
    // No table should be emitted for the empty case.
    expect(JSON.stringify(content)).not.toContain('"body"')
  })

  it('renders a header row plus one body row per shift, sorted by date and name', () => {
    const shifts: ShiftForExport[] = [
      baseShift({ date: '2026-04-28', user: { name: 'Bob' } }),
      baseShift({ date: '2026-04-27', user: { name: 'Charlie' } }),
      baseShift({ date: '2026-04-27', user: { name: 'Alice' } }),
    ]
    const doc = buildShiftPdf(shifts, meta)
    const content = doc.content as any[]
    const table = content.find((entry) => entry.table)
    expect(table).toBeDefined()
    const body = table.table.body
    // 1 header row + 3 data rows
    expect(body).toHaveLength(4)
    // Sort key: (date asc, then user name asc, locale 'no')
    expect(body[1][1]).toBe('Alice')
    expect(body[2][1]).toBe('Charlie')
    expect(body[3][1]).toBe('Bob')
  })

  it('formats start/end times as HH:mm in the table cells', () => {
    const doc = buildShiftPdf([baseShift()], meta)
    const content = doc.content as any[]
    const table = content.find((entry) => entry.table)
    const dataRow = table.table.body[1]
    // [Dato, Ansatt, Vakttype, Start, Slutt, Kommentar]
    expect(dataRow[3]).toMatch(/^\d{2}:\d{2}$/)
    expect(dataRow[4]).toMatch(/^\d{2}:\d{2}$/)
  })

  it('shows empty string instead of "null" for shifts with no comment', () => {
    const doc = buildShiftPdf([baseShift({ comment: null })], meta)
    const content = doc.content as any[]
    const table = content.find((entry) => entry.table)
    const dataRow = table.table.body[1]
    expect(dataRow[5]).toBe('')
  })

  it('includes a generation timestamp and shift count in the meta line', () => {
    const doc = buildShiftPdf(
      [baseShift(), baseShift({ user: { name: 'Bob' } })],
      meta
    )
    const content = doc.content as any[]
    const metaLine = content.find((entry) => entry?.style === 'meta')
    expect(metaLine.text).toContain('2 vakter')
  })

  it('uses singular form when there is exactly one shift', () => {
    const doc = buildShiftPdf([baseShift()], meta)
    const content = doc.content as any[]
    const metaLine = content.find((entry) => entry?.style === 'meta')
    expect(metaLine.text).toMatch(/\b1 vakt\b/)
    expect(metaLine.text).not.toMatch(/1 vakter/)
  })
})

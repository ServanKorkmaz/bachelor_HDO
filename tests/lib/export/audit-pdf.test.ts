import { describe, expect, it } from 'vitest'
import { buildAuditPdf, type AuditPdfRow } from '@/lib/export/audit-pdf'

const baseRow = (overrides: Partial<AuditPdfRow> = {}): AuditPdfRow => ({
  timestamp: '15.05.2026 14:00',
  actor: 'Leder',
  action: 'Vaktbytte godkjent',
  entityType: 'Vaktbytte',
  entity: 'Anne Berg → Ingrid Larsen, 13.05.2026',
  ...overrides,
})

const meta = {
  dateFrom: '2026-05-01',
  dateTo: '2026-05-15',
  entityFilterLabel: 'Alle',
  downloadedBy: 'Admin',
  generatedAt: new Date('2026-05-15T14:30:00.000Z'),
}

/**
 * Unit tests for the audit PDF document-definition builder. Exercise the pure
 * function — no pdfmake runtime, no fonts — so they're fast and deterministic.
 * The downloader is excluded for the same reason as the shift-pdf tests.
 */
describe('buildAuditPdf', () => {
  it('renders an A4 landscape document with period metadata in the title', () => {
    const doc = buildAuditPdf([baseRow()], meta)
    expect(doc.pageSize).toBe('A4')
    expect(doc.pageOrientation).toBe('landscape')
    expect(doc.info?.title).toContain('2026-05-01')
    expect(doc.info?.title).toContain('2026-05-15')
  })

  it('renders the empty-state message and no table when there are no rows', () => {
    const doc = buildAuditPdf([], meta)
    const content = doc.content as any[]
    const tail = content[content.length - 1]
    expect(JSON.stringify(tail)).toContain('Ingen hendelser')
    expect(JSON.stringify(content)).not.toContain('"body"')
  })

  it('renders a header row plus one body row per audit row, in input order', () => {
    const rows: AuditPdfRow[] = [
      baseRow({ timestamp: '15.05.2026 14:00', entity: 'Row A' }),
      baseRow({ timestamp: '15.05.2026 14:01', entity: 'Row B' }),
      baseRow({ timestamp: '15.05.2026 14:02', entity: 'Row C' }),
    ]
    const doc = buildAuditPdf(rows, meta)
    const content = doc.content as any[]
    const table = content.find((entry) => entry.table)
    expect(table).toBeDefined()
    const body = table.table.body
    // 1 header + 3 data rows
    expect(body).toHaveLength(4)
    // Entity column is index 4; rows in original order
    expect(body[1][4]).toBe('Row A')
    expect(body[2][4]).toBe('Row B')
    expect(body[3][4]).toBe('Row C')
  })

  it('shows generation timestamp, downloader, and event count in the meta line', () => {
    const doc = buildAuditPdf([baseRow(), baseRow({ action: 'Vaktbytte avvist' })], meta)
    const content = doc.content as any[]
    const metaLine = content.find((entry) => entry?.style === 'meta')
    expect(metaLine.text).toContain('Admin')
    expect(metaLine.text).toContain('2 hendelser')
  })

  it('uses singular form when there is exactly one event', () => {
    const doc = buildAuditPdf([baseRow()], meta)
    const content = doc.content as any[]
    const metaLine = content.find((entry) => entry?.style === 'meta')
    expect(metaLine.text).toMatch(/\b1 hendelse\b/)
    expect(metaLine.text).not.toMatch(/1 hendelser/)
  })

  it('describes the period as "hele perioden" when no date filter is applied', () => {
    const doc = buildAuditPdf([baseRow()], { ...meta, dateFrom: '', dateTo: '' })
    const content = doc.content as any[]
    expect(JSON.stringify(content)).toContain('hele perioden')
  })

  it('includes the entity filter label so an archived copy is self-documenting', () => {
    const doc = buildAuditPdf([baseRow()], { ...meta, entityFilterLabel: 'Ferie' })
    const content = doc.content as any[]
    expect(JSON.stringify(content)).toContain('Filter: Ferie')
  })
})

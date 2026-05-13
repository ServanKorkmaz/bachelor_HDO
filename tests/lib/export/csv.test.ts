import { describe, expect, it } from 'vitest'
import { toCsv, type CsvColumn } from '@/lib/export/csv'

interface Row {
  name: string
  age: number | null
  note: string
}

const columns: CsvColumn<Row>[] = [
  { header: 'Navn', accessor: (r) => r.name },
  { header: 'Alder', accessor: (r) => r.age },
  { header: 'Notat', accessor: (r) => r.note },
]

/**
 * Unit tests for the CSV builder. These pin down the RFC 4180 quoting rules
 * and the defaults (semicolon delimiter for Norwegian Excel, CRLF newlines)
 * so a future tweak doesn't silently break how Excel/Sheets imports the file.
 */
describe('toCsv', () => {
  it('renders header row followed by data rows', () => {
    const csv = toCsv([{ name: 'Alice', age: 30, note: 'ok' }], columns)
    expect(csv).toBe('Navn;Alder;Notat\r\nAlice;30;ok')
  })

  it('renders just the header when there are no rows', () => {
    const csv = toCsv<Row>([], columns)
    expect(csv).toBe('Navn;Alder;Notat')
  })

  it('renders null and undefined as empty cells', () => {
    const csv = toCsv([{ name: 'Bob', age: null, note: '' }], columns)
    expect(csv).toBe('Navn;Alder;Notat\r\nBob;;')
  })

  it('quotes cells that contain the delimiter', () => {
    const csv = toCsv([{ name: 'Smith; John', age: 1, note: 'fine' }], columns)
    expect(csv).toContain('"Smith; John"')
  })

  it('escapes embedded quotes by doubling them', () => {
    const csv = toCsv([{ name: 'O\'Hara "the" boss', age: 1, note: '' }], columns)
    expect(csv).toContain('"O\'Hara ""the"" boss"')
  })

  it('quotes cells containing newlines', () => {
    const csv = toCsv([{ name: 'A', age: 1, note: 'line1\nline2' }], columns)
    expect(csv).toContain('"line1\nline2"')
  })

  it('respects a custom delimiter and quotes the new delimiter', () => {
    const csv = toCsv(
      [{ name: 'A, comma', age: 1, note: 'fine' }],
      columns,
      { delimiter: ',' }
    )
    expect(csv).toContain('"A, comma"')
    // The previously-special semicolon should no longer trigger quoting.
    const csv2 = toCsv([{ name: 'has; semi', age: 1, note: 'ok' }], columns, { delimiter: ',' })
    expect(csv2).toContain('has; semi')
    expect(csv2).not.toContain('"has; semi"')
  })

  it('uses CRLF newlines per RFC 4180 by default', () => {
    const csv = toCsv(
      [
        { name: 'A', age: 1, note: '' },
        { name: 'B', age: 2, note: '' },
      ],
      columns
    )
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

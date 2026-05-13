"use client"

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { exportShiftsCsv, exportShiftsPdf, type ShiftForExport } from '@/lib/export/shift-export'
import { useToast } from '@/components/ui/use-toast'

interface ExportMenuProps {
  shifts: ShiftForExport[]
  teamName: string
  dateFrom: string
  dateTo: string
  /** Optional label override for the trigger button. */
  label?: string
  disabled?: boolean
}

/**
 * Dropdown that lets the user download the currently-visible shifts as CSV
 * or PDF. Sits next to the existing date-navigation controls on the
 * schedule pages and operates on data the page already has in memory — no
 * extra network round-trip. The PDF library is dynamically imported on
 * first click so users who never export don't pay its ~1MB bundle cost.
 */
export function ExportMenu({ shifts, teamName, dateFrom, dateTo, label = 'Last ned', disabled }: ExportMenuProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null)

  const handleCsv = async () => {
    if (busy) return
    setBusy('csv')
    try {
      await exportShiftsCsv(shifts, { teamName, dateFrom, dateTo })
    } catch (error) {
      console.error('CSV export failed:', error)
      toast({ title: 'Eksport feilet', description: 'Kunne ikke lage CSV-fil.', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const handlePdf = async () => {
    if (busy) return
    setBusy('pdf')
    try {
      await exportShiftsPdf(shifts, { teamName, dateFrom, dateTo })
    } catch (error) {
      console.error('PDF export failed:', error)
      toast({ title: 'Eksport feilet', description: 'Kunne ikke lage PDF-fil.', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy !== null}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCsv} disabled={busy !== null}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Som CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePdf} disabled={busy !== null}>
          <FileText className="h-4 w-4 mr-2" />
          Som PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

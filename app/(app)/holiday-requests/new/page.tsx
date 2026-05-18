"use client"

import { useState, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { dateNDaysAgoString, todayStringInTimeZone } from '@/lib/date-utils'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { axiosInstance } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'

export default function NewHolidayRequestPage() {
  const { data: me } = useMe()
  const router = useRouter()
  const { toast } = useToast()

  const [type, setType] = useState('HOLIDAY')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // Compute date boundaries
  const todayStr = useMemo(() => todayStringInTimeZone(), [])
  const sicknessMinStr = useMemo(() => dateNDaysAgoString(30), [])

  const createHolidayRequest = useMutation({
    mutationFn: async (payload: any) => {
      const res = await axiosInstance.post('/api/holiday-requests', payload)
      return res.data
    },
  })

  if (!me) return <div>Vennligst logg inn for å sende fraværsforespørsel</div>

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dateFrom) {
      toast({ title: 'Validering', description: 'Velg startdato', variant: 'destructive' })
      return
    }
    // Basic validations: dateFrom not in past for non-sickness; sickness allowed up to 30 days back
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (type !== 'SICKNESS' && from < today) {
      toast({ title: 'Validering', description: 'Startdato kan ikke være i fortiden for ferie/fravær', variant: 'destructive' })
      return
    }

    if (type === 'SICKNESS') {
      const earliest = new Date()
      earliest.setHours(0, 0, 0, 0)
      earliest.setDate(earliest.getDate() - 30)
      if (from < earliest) {
        toast({ title: 'Validering', description: 'Sykdom kan kun registreres opptil 30 dager tilbake i tid', variant: 'destructive' })
        return
      }
    }

    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(0, 0, 0, 0)
      if (to < from) {
        toast({ title: 'Validering', description: 'Sluttdato kan ikke være før startdato', variant: 'destructive' })
        return
      }
    }
    setLoading(true)
    try {
      const payload = {
        type,
        dateFrom,
        dateTo: dateTo || undefined,
        message: message || undefined,
      }

      await createHolidayRequest.mutateAsync(payload)
      toast({ title: 'Sendt', description: 'Forespørselen er sendt til godkjenning' })
      router.push('/agenda')
    } catch (err) {
      console.error(err)
      const message = (err as any)?.response?.data?.error || 'Nettverksfeil'
      toast({ title: 'Feil', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Be om fravær / ferie</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v: string) => setType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HOLIDAY">Ferie</SelectItem>
              <SelectItem value="ABSENCE">Fravær</SelectItem>
              <SelectItem value="SICKNESS">Sykdom</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">Merk: For sykefravær kan du registrere inntil 30 dager tilbake. Leder kan be om dokumentasjon for retrospektive forespørsler.</p>
        </div>

        <div>
          <Label>Fra</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            min={type === 'SICKNESS' ? sicknessMinStr : todayStr}
          />
        </div>

        <div>
          <Label>Til (valgfritt)</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || (type === 'SICKNESS' ? sicknessMinStr : todayStr)}
          />
        </div>

        <div>
          <Label>Melding (valgfritt)</Label>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>{loading ? 'Sender…' : 'Send forespørsel'}</Button>
          <Button variant="ghost" onClick={() => router.push('/agenda')}>Avbryt</Button>
        </div>
      </form>
    </div>
  )
}

"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/mockAuth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'

export default function NewHolidayRequestPage() {
  const { currentUser } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [type, setType] = useState('HOLIDAY')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (!currentUser) return <div>Vennligst logg inn for å sende fraværsforespørsel</div>

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dateFrom) {
      toast({ title: 'Validering', description: 'Velg startdato', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const payload = {
        teamId: currentUser.teamId,
        userId: currentUser.id,
        type,
        dateFrom,
        dateTo: dateTo || undefined,
        message: message || undefined,
      }

      const res = await fetch('/api/holiday-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': currentUser.id },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast({ title: 'Sendt', description: 'Forespørselen er sendt til godkjenning' })
        router.push('/agenda')
      } else {
        toast({ title: 'Feil', description: data.error || 'Kunne ikke sende forespørsel', variant: 'destructive' })
      }
    } catch (err) {
      console.error(err)
      toast({ title: 'Feil', description: 'Nettverksfeil', variant: 'destructive' })
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
            <SelectItem value="HOLIDAY">Ferie</SelectItem>
            <SelectItem value="ABSENCE">Fravær</SelectItem>
            <SelectItem value="SICKNESS">Sykdom</SelectItem>
          </Select>
        </div>

        <div>
          <Label>Fra</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div>
          <Label>Til (valgfritt)</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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

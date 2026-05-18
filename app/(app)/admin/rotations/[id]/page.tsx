"use client"

import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { useToast } from '@/components/ui/use-toast'
import { RotationEditor, type RotationFormValue } from '@/components/admin/RotationEditor'

interface RotationPattern {
  id: string
  teamId: string
  name: string
  weeks: number
  slotsJson: string
}

export default function EditRotationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const { data: pattern, isLoading } = useQuery<RotationPattern>({
    queryKey: ['rotation-pattern', params.id],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/rotation-patterns/${params.id}`)
      return res.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (value: RotationFormValue) =>
      axiosInstance.put(`/api/rotation-patterns/${params.id}`, value),
    onSuccess: () => {
      toast({ title: 'Mønster oppdatert' })
      router.push('/admin/rotations')
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast({
        title: 'Feil',
        description: e.response?.data?.error ?? 'Kunne ikke oppdatere',
        variant: 'destructive',
      })
    },
  })

  if (isLoading || !pattern) return <p className="text-muted-foreground">Laster…</p>

  const initial: RotationFormValue = {
    teamId: pattern.teamId,
    name: pattern.name,
    weeks: pattern.weeks,
    slots: JSON.parse(pattern.slotsJson),
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Rediger turnusmønster</h1>
      <RotationEditor
        teamId={pattern.teamId}
        initial={initial}
        onSubmit={(value) => updateMutation.mutate(value)}
        submitting={updateMutation.isPending}
      />
    </div>
  )
}

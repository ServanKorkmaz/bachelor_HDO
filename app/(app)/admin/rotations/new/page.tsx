"use client"

import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'
import { useMe } from '@/lib/hooks/useMe'
import { useToast } from '@/components/ui/use-toast'
import { RotationEditor, type RotationFormValue } from '@/components/admin/RotationEditor'

export default function NewRotationPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: me } = useMe()

  const createMutation = useMutation({
    mutationFn: async (value: RotationFormValue) =>
      axiosInstance.post('/api/rotation-patterns', value),
    onSuccess: () => {
      toast({ title: 'Plan opprettet' })
      queryClient.invalidateQueries({ queryKey: ['rotation-patterns'] })
      router.push('/admin/rotations')
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast({
        title: 'Feil',
        description: e.response?.data?.error ?? 'Kunne ikke opprette plan',
        variant: 'destructive',
      })
    },
  })

  if (!me) return <p className="text-muted-foreground">Laster…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Ny turnusplan</h1>
      <RotationEditor
        teamId={me.teamId}
        onSubmit={(value) => createMutation.mutate(value)}
        submitting={createMutation.isPending}
      />
    </div>
  )
}

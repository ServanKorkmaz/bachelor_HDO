"use client"

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, Edit } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { axiosInstance } from '@/lib/axios'

const normalizeHexColor = (value: string): string | null => {
  const cleaned = value.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null
  }

  return `#${cleaned.toLowerCase()}`
}

/**
 * Admin page to manage shift types and colors.
 *
 * Reachable only when the parent `AdminLayout` has confirmed the caller is
 * an admin; non-admin role checks below are therefore not needed for UX.
 * The API still enforces them — see `withAdmin` on the shift-types routes.
 */
export default function ShiftTypesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingShiftType, setEditingShiftType] = useState<any>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string; label: string }>({ open: false, id: '', label: '' })
  const [colorInput, setColorInput] = useState('#000000')
  const [formData, setFormData] = useState({
    code: '',
    label: '',
    color: '#000000',
    defaultStartTime: '08:00',
    defaultEndTime: '16:00',
    crossesMidnight: false,
  })

  const { data: shiftTypes = [] } = useQuery<any[]>({
    queryKey: ['shift-types'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/shift-types')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      return axiosInstance.post('/api/shift-types', { ...formData })
    },
    onSuccess: async () => {
      setIsCreateModalOpen(false)
      resetForm()
      await queryClient.invalidateQueries({ queryKey: ['shift-types'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingShiftType?.id) {
        throw new Error('Missing shift type')
      }
      return axiosInstance.put(`/api/shift-types/${editingShiftType.id}`, { ...formData })
    },
    onSuccess: async () => {
      setEditingShiftType(null)
      resetForm()
      await queryClient.invalidateQueries({ queryKey: ['shift-types'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (shiftTypeId: string) => {
      return axiosInstance.delete(`/api/shift-types/${shiftTypeId}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shift-types'] })
    },
  })

  const handleCreate = async () => {
    if (!formData.code || !formData.label) return
    try {
      await createMutation.mutateAsync()
    } catch {
      toast({ title: 'Feil', description: 'Kunne ikke opprette vakttype', variant: 'destructive' })
    }
  }

  const handleUpdate = async () => {
    if (!editingShiftType || !formData.code || !formData.label) return
    try {
      await updateMutation.mutateAsync()
    } catch {
      toast({ title: 'Feil', description: 'Kunne ikke oppdatere vakttype', variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(deleteDialog.id)
    } catch {
      toast({ title: 'Feil', description: 'Kunne ikke slette vakttype', variant: 'destructive' })
    }
  }

  const resetForm = () => {
    setColorInput('#000000')
    setFormData({
      code: '',
      label: '',
      color: '#000000',
      defaultStartTime: '08:00',
      defaultEndTime: '16:00',
      crossesMidnight: false,
    })
  }

  const openEditModal = (shiftType: any) => {
    setColorInput(shiftType.color)
    setEditingShiftType(shiftType)
    setFormData({
      code: shiftType.code,
      label: shiftType.label,
      color: shiftType.color,
      defaultStartTime: shiftType.defaultStartTime,
      defaultEndTime: shiftType.defaultEndTime,
      crossesMidnight: shiftType.crossesMidnight,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Vakttyper</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ny vakttype
        </Button>
      </div>

      <div className="space-y-2">
        {shiftTypes.map(shiftType => (
          <div
            key={shiftType.id}
            className="p-4 bg-card rounded-lg border flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-8 h-8 rounded"
                style={{ backgroundColor: shiftType.color }}
              />
              <div>
                <div className="font-medium">{shiftType.label}</div>
                <div className="text-sm text-muted-foreground">
                  {shiftType.code} - {shiftType.defaultStartTime} til {shiftType.defaultEndTime}
                  {shiftType.crossesMidnight && ' (krysser midnatt)'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => openEditModal(shiftType)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setDeleteDialog({ open: true, id: shiftType.id, label: shiftType.label })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog(d => ({ ...d, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slett vakttype</DialogTitle>
            <DialogDescription>
              Er du sikker på at du vil slette <strong>{deleteDialog.label}</strong>? Dette kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(d => ({ ...d, open: false }))}>Avbryt</Button>
            <Button variant="destructive" onClick={async () => { setDeleteDialog(d => ({ ...d, open: false })); await handleDelete() }}>Slett</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateModalOpen || !!editingShiftType} onOpenChange={(open) => {
        if (!open) {
          setIsCreateModalOpen(false)
          setEditingShiftType(null)
          resetForm()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingShiftType ? 'Rediger vakttype' : 'Opprett ny vakttype'}
            </DialogTitle>
            <DialogDescription>
              {editingShiftType ? 'Oppdater vakttypeinformasjon' : 'Legg til en ny vakttype i systemet'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Kode</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="f.eks. Dag, N1, K1"
              />
            </div>
            <div className="space-y-2">
              <Label>Etikett</Label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="f.eks. Dag 08-16.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Farge</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => {
                    setColorInput(e.target.value)
                    setFormData({ ...formData, color: e.target.value })
                  }}
                  className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-1"
                  aria-label="Velg farge"
                />
                <Input
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  onBlur={(e) => {
                    const normalized = normalizeHexColor(e.target.value)
                    const nextColor = normalized ?? formData.color
                    setColorInput(nextColor)
                    setFormData({ ...formData, color: nextColor })
                  }}
                  placeholder="#000000"
                  maxLength={7}
                  className="max-w-[140px] uppercase"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Bruk fargehjulet eller skriv hex-farge (for eksempel #1d4ed8).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Standard starttid</Label>
                <Input
                  type="time"
                  value={formData.defaultStartTime}
                  onChange={(e) => setFormData({ ...formData, defaultStartTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Standard sluttid</Label>
                <Input
                  type="time"
                  value={formData.defaultEndTime}
                  onChange={(e) => setFormData({ ...formData, defaultEndTime: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="crossesMidnight"
                checked={formData.crossesMidnight}
                onChange={(e) => setFormData({ ...formData, crossesMidnight: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="crossesMidnight">Krysser midnatt</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false)
                setEditingShiftType(null)
                resetForm()
              }}
            >
              Avbryt
            </Button>
            <Button
              onClick={editingShiftType ? handleUpdate : handleCreate}
              disabled={!formData.code || !formData.label}
            >
              {editingShiftType ? 'Oppdater' : 'Opprett'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


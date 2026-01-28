"use client"

import { useState, useEffect } from 'react'
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

/** Admin page to manage shift types and colors. */
export default function ShiftTypesPage() {
  const [shiftTypes, setShiftTypes] = useState<any[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingShiftType, setEditingShiftType] = useState<any>(null)
  const [formData, setFormData] = useState({
    code: '',
    label: '',
    color: '#000000',
    defaultStartTime: '08:00',
    defaultEndTime: '16:00',
    crossesMidnight: false,
  })

  useEffect(() => {
    fetchShiftTypes()
  }, [])

  const fetchShiftTypes = () => {
    fetch('/api/shift-types')
      .then(res => res.json())
      .then(data => setShiftTypes(data))
      .catch(console.error)
  }

  const handleCreate = async () => {
    if (!formData.code || !formData.label) return

    try {
      const response = await fetch('/api/shift-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setIsCreateModalOpen(false)
        resetForm()
        fetchShiftTypes()
      } else {
        alert('Kunne ikke opprette vakttype')
      }
    } catch (error) {
      console.error('Error creating shift type:', error)
      alert('Kunne ikke opprette vakttype')
    }
  }

  const handleUpdate = async () => {
    if (!editingShiftType || !formData.code || !formData.label) return

    try {
      const response = await fetch(`/api/shift-types/${editingShiftType.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setEditingShiftType(null)
        resetForm()
        fetchShiftTypes()
      } else {
        alert('Kunne ikke oppdatere vakttype')
      }
    } catch (error) {
      console.error('Error updating shift type:', error)
      alert('Kunne ikke oppdatere vakttype')
    }
  }

  const handleDelete = async (shiftTypeId: string) => {
    if (!confirm('Er du sikker på at du vil slette denne vakttypen?')) return

    try {
      const response = await fetch(`/api/shift-types/${shiftTypeId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchShiftTypes()
      } else {
        alert('Kunne ikke slette vakttype')
      }
    } catch (error) {
      console.error('Error deleting shift type:', error)
      alert('Kunne ikke slette vakttype')
    }
  }

  const resetForm = () => {
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
                onClick={() => handleDelete(shiftType.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

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
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
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


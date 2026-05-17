"use client"

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { axiosInstance } from '@/lib/axios'

/** Notification bell with polling and mark-as-read handling. */
export function NotificationsPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load user')
      return res.json() as Promise<{ id: string; name: string; email: string; role: 'ADMIN' | 'LEADER' | 'EMPLOYEE'; teamId: string }>
    },
  })
  const queryClient = useQueryClient()

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['notifications', me?.id],
    queryFn: async () => {
      const response = await axiosInstance.get(`/api/notifications?userId=${me!.id}`)
      return Array.isArray(response.data) ? response.data.slice(0, 10) : []
    },
    enabled: Boolean(me?.id),
    refetchInterval: 30000,
  })

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await axiosInstance.post(`/api/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', me?.id] })
    },
  })

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsReadMutation.mutateAsync(notificationId)
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Varsler</DialogTitle>
            <DialogDescription>
              Du har {unreadCount} uleste varsler
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Ingen varsler
              </p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${
                    !notification.read ? 'bg-primary/10' : ''
                  }`}
                  onClick={() => handleMarkAsRead(notification.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{notification.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {notification.message}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(notification.createdAt), 'dd.MM.yyyy HH:mm')}
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-primary ml-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}


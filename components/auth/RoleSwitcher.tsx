"use client"

import { useAuth, MockUser } from '@/lib/auth/mockAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@/lib/axios'

/** Dropdown to switch the current mock user/role for demo purposes. */
export function RoleSwitcher() {
  const { currentUser, setCurrentUser } = useAuth()
  const [users, setUsers] = useState<MockUser[]>([])

  const { data: fetchedUsers = [] } = useQuery<MockUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axiosInstance.get('/api/users')
      return Array.isArray(res.data) ? res.data : []
    },
  })

  useEffect(() => {
    setUsers(Array.isArray(fetchedUsers) ? fetchedUsers : [])
    if (!currentUser && Array.isArray(fetchedUsers) && fetchedUsers.length > 0) {
      setCurrentUser(fetchedUsers[0])
    }
  }, [fetchedUsers, currentUser, setCurrentUser])

  const handleUserSelect = (user: MockUser) => {
    setCurrentUser(user)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentUser?.name || 'Velg bruker'}
          </span>
          <span className="sm:hidden">
            {currentUser?.name.split(' ').map(n => n[0]).join('') || '?'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Bytt rolle/bruker</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="cursor-pointer">
            Min profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {Array.isArray(users) && users.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => handleUserSelect(user)}
            className={currentUser?.id === user.id ? 'bg-accent' : ''}
          >
            <div className="flex flex-col">
              <span>{user.name}</span>
              <span className="text-xs text-muted-foreground">
                {user.role}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


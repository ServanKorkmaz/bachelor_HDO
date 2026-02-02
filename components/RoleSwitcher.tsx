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

/** Dropdown to switch the current mock user/role for demo purposes. */
export function RoleSwitcher() {
  const { currentUser, setCurrentUser } = useAuth()
  const [users, setUsers] = useState<MockUser[]>([])

  useEffect(() => {
    // Fetch users for role switching
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data)
        // Auto-select first user on mount if no user selected
        if (!currentUser && data.length > 0) {
          setCurrentUser(data[0])
        }
      })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        {users.map((user) => (
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


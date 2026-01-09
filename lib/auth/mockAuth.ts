import { create } from 'zustand'
import { UserRole } from '@prisma/client'

export interface MockUser {
  id: string
  name: string
  email: string
  role: UserRole
  teamId: string
}

interface AuthState {
  currentUser: MockUser | null
  setCurrentUser: (user: MockUser | null) => void
  isAdmin: () => boolean
  isLeader: () => boolean
  isEmployee: () => boolean
  canEditShifts: () => boolean
  canApproveSwaps: () => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  isAdmin: () => get().currentUser?.role === 'ADMIN',
  isLeader: () => get().currentUser?.role === 'LEADER',
  isEmployee: () => get().currentUser?.role === 'EMPLOYEE',
  canEditShifts: () => {
    const role = get().currentUser?.role
    return role === 'ADMIN' || role === 'LEADER'
  },
  canApproveSwaps: () => {
    const role = get().currentUser?.role
    return role === 'ADMIN' || role === 'LEADER'
  },
}))


/**
 * Shared UI-facing types for objects returned by the JSON API. These mirror
 * the shapes that route handlers emit (which is `select`/`include`-shaped,
 * not the bare Prisma model), so the frontend can type its `useQuery`
 * results without each page re-declaring an inline shape or falling back to
 * `any`.
 */

export type UserRole = 'ADMIN' | 'LEADER' | 'EMPLOYEE'

/** Minimal user surface returned by `/api/users`. */
export interface UserSummary {
  id: string
  name: string
  role: UserRole
  teamId: string
}

/** Shape returned by `/api/teams`. */
export interface TeamSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

/** Re-exported from ShiftModal where it is also the form's working type. */
export type { ShiftType, Shift } from '@/components/schedule/ShiftModal'

/** Note as returned by `/api/notes` (createdBy included). */
export interface NoteWithCreator {
  id: string
  teamId: string
  createdByUserId: string
  type: 'GENERAL' | 'INFO' | 'ABSENCE' | 'HOLIDAY' | 'SICKNESS'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  title: string | null
  body: string
  dateFrom: string
  dateTo: string
  visibility: 'ALL' | 'LEADERS' | 'TEAM'
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

/** Notification list-row, as returned by `/api/notifications`. */
export interface NotificationItem {
  id: string
  teamId: string
  userId: string | null
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

/** Swap request as returned by `/api/swap-requests` (with relations). */
export interface SwapRequestWithRelations {
  id: string
  teamId: string
  requestedByUserId: string
  fromUserId: string
  toUserId: string
  shiftId: string
  status: 'AWAITING_ACCEPTANCE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED'
  message: string | null
  createdAt: string
  decidedBy: string | null
  decidedAt: string | null
  requestedBy: { id: string; name: string }
  fromUser: { id: string; name: string }
  toUser: { id: string; name: string }
  shift: import('@/components/schedule/ShiftModal').Shift
}

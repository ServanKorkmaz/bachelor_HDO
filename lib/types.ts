/**
 * Shared UI-facing types for objects returned by the JSON API. These mirror
 * the shapes that route handlers emit (which is `select`/`include`-shaped,
 * not the bare Prisma model), so the frontend can type its `useQuery`
 * results without each page re-declaring an inline shape or falling back to
 * `any`.
 */

export type UserRole = 'ADMIN' | 'LEADER' | 'EMPLOYEE'

export type RequestStatus =
  | 'AWAITING_ACCEPTANCE'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'

export type NoteType = 'GENERAL' | 'INFO' | 'ABSENCE' | 'HOLIDAY' | 'SICKNESS'
export type NoteVisibility = 'ALL' | 'LEADERS' | 'TEAM'
export type ActiveStatus = 'active' | 'inactive'

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
  type: NoteType
  status: RequestStatus
  title: string | null
  body: string
  dateFrom: string
  dateTo: string
  visibility: NoteVisibility
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
  toShiftId: string | null
  status: RequestStatus
  message: string | null
  createdAt: string
  decidedBy: string | null
  decidedAt: string | null
  requestedBy: { id: string; name: string }
  fromUser: { id: string; name: string }
  toUser: { id: string; name: string }
  shift: import('@/components/schedule/ShiftModal').Shift
  toShift: import('@/components/schedule/ShiftModal').Shift | null
}

/** Holiday / absence request as returned by `/api/holiday-requests`. */
export interface HolidayRequestRow {
  id: string
  teamId: string
  userId: string
  type: string
  status: RequestStatus
  dateFrom: string
  /** Null when the request covers a single day (dateFrom only). */
  dateTo: string | null
  message: string | null
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; name: string }
  decidedByUser?: { id: string; name: string } | null
}

/** Week note as returned by `/api/week-notes`. */
export interface WeekNoteRow {
  id: string
  teamId: string
  userId: string
  isoYear: number
  isoWeek: number
  body: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Per-team notification settings (`/api/notification-settings`). */
export interface NotificationSettings {
  id: string
  teamId: string
  emailEnabled: boolean
  smsEndpoint: string | null
  createdAt: string
  updatedAt: string
}

/** Per-user notification preferences (`/api/users/[id]/notification-preferences`). */
export interface NotificationPreference {
  shiftChangesEmail: boolean
  shiftChangesSms: boolean
  swapEmail: boolean
  swapSms: boolean
  noteEmail: boolean
  noteSms: boolean
}

/** Audit log row enriched with optional live-entity snapshot (`/api/admin/audit`). */
export interface AuditLogRow {
  id: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
  /** Best-effort live-entity snapshot — see audit route comment. */
  entitySnapshot:
    | { fromUserId: string; toUserId: string; shiftDate: string }
    | { userId: string; type: string; dateFrom: string; dateTo: string | null }
    | null
}

/** Row in the admin user-list (`/api/admin/users`). */
export interface AdminUserRow {
  id: string
  name: string
  email: string
  status: ActiveStatus
  teams: {
    teamId: string
    teamName: string
    role: 'LEADER' | 'EMPLOYEE'
    membershipId: string
  }[]
  primaryTeam: { id: string; name: string } | null
  createdAt: string
  lastLoginAt: string | null
}

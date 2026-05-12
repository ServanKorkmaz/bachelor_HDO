import { z } from 'zod'

const id = z.string().min(1)
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato (YYYY-MM-DD)')
const timeString = z.string().regex(/^\d{2}:\d{2}$/, 'Ugyldig tid (HH:MM)')
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Ugyldig farge (#RRGGBB)')

const HOLIDAY_TYPES = ['HOLIDAY', 'ABSENCE', 'SICKNESS'] as const
const REQUEST_STATUSES = ['AWAITING_ACCEPTANCE', 'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] as const
const NOTE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
const USER_ROLES = ['ADMIN', 'LEADER', 'EMPLOYEE'] as const
const MEMBERSHIP_ROLES = ['LEADER', 'EMPLOYEE'] as const
const ACTIVE_STATUSES = ['active', 'inactive'] as const

// === Admin ===

export const patchUserStatusSchema = z.object({
  status: z.enum(ACTIVE_STATUSES),
  currentUserId: id.optional(),
})

export const addMemberSchema = z.object({
  userId: id,
  role: z.enum(MEMBERSHIP_ROLES),
  currentUserId: id.optional(),
})

export const patchMembershipSchema = z.object({
  role: z.enum(MEMBERSHIP_ROLES).optional(),
  status: z.enum(ACTIVE_STATUSES).optional(),
  currentUserId: id.optional(),
})

export const createUserSchema = z.object({
  name: z.string().min(1, 'Navn er påkrevd'),
  email: z.string().email('Ugyldig e-post'),
  teamId: id.refine((v) => v.length > 0, 'Team er påkrevd'),
  role: z.enum(USER_ROLES),
  currentUserId: id.optional(),
})

// === Shifts ===

export const shiftCreateSchema = z.object({
  date: dateString,
  userId: id,
  shiftTypeId: id,
  startTime: timeString,
  endTime: timeString,
  teamId: id.optional(),
  comment: z.string().max(2000).optional().nullable(),
})

export const shiftUpdateSchema = z.object({
  date: dateString,
  userId: id,
  shiftTypeId: id,
  startTime: timeString,
  endTime: timeString,
  comment: z.string().max(2000).optional().nullable(),
})

export const bulkShiftSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  teamId: id.optional(),
  currentUserId: id.optional(),
  items: z
    .array(
      z.object({
        shiftId: id.optional(),
        userId: id.optional(),
        date: dateString.optional(),
        shiftTypeId: id.optional(),
        startTime: timeString.optional(),
        endTime: timeString.optional(),
        comment: z.string().max(2000).optional(),
      })
    )
    .min(0)
    .max(200, 'Maks 200 elementer per kall'),
})

// === Notes ===

export const noteCreateSchema = z.object({
  teamId: id,
  createdByUserId: id,
  type: z.string().min(1),
  body: z.string().min(1).max(5000),
  dateFrom: dateString,
  dateTo: dateString,
  status: z.enum(NOTE_STATUSES).optional(),
  title: z.string().max(200).optional().nullable(),
})

export const noteApproveSchema = z.object({
  status: z.enum(NOTE_STATUSES),
})

// === Holiday requests ===

export const holidayCreateSchema = z.object({
  teamId: id.optional(),
  userId: id.optional(),
  type: z.enum(HOLIDAY_TYPES),
  dateFrom: dateString,
  dateTo: dateString.optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  currentUserId: id.optional(),
})

export const holidayPatchSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  currentUserId: id.optional(),
})

export const holidayPutSchema = z.object({
  type: z.enum(HOLIDAY_TYPES),
  dateFrom: dateString,
  dateTo: dateString.optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  currentUserId: id.optional(),
})

// === Swap requests ===

export const swapCreateSchema = z.object({
  teamId: id,
  requestedByUserId: id,
  shiftId: id,
  toUserId: id,
  message: z.string().max(2000).optional().nullable(),
})

export const swapMessageSchema = z.object({
  message: z.string().max(2000).optional().nullable(),
  currentUserId: id.optional(),
})

// === Teams ===

export const teamCreateSchema = z.object({
  name: z.string().min(1, 'Navn er påkrevd').max(100),
  currentUserId: id.optional(),
})

export const teamDeleteSchema = z.object({
  currentUserId: id,
})

// === Shift types ===

export const shiftTypeBodySchema = z.object({
  code: z.string().min(1).max(20),
  label: z.string().min(1).max(100),
  color: hexColor,
  defaultStartTime: timeString,
  defaultEndTime: timeString,
  crossesMidnight: z.boolean().optional(),
  currentUserId: id.optional(),
})

// === Notification settings (per team) ===

export const notificationSettingsSchema = z.object({
  teamId: id,
  emailEnabled: z.boolean().optional(),
  smsEndpoint: z.string().nullable().optional(),
})

// === User notification preferences ===

export const notificationPreferencesSchema = z.object({
  shiftChangesEmail: z.boolean().optional(),
  shiftChangesSms: z.boolean().optional(),
  swapEmail: z.boolean().optional(),
  swapSms: z.boolean().optional(),
  noteEmail: z.boolean().optional(),
  noteSms: z.boolean().optional(),
})

// === User role update ===

export const userRoleUpdateSchema = z.object({
  role: z.enum(USER_ROLES),
  currentUserId: id.optional(),
})

// === Type exports ===

export type PatchUserStatusBody = z.infer<typeof patchUserStatusSchema>
export type AddMemberBody = z.infer<typeof addMemberSchema>
export type PatchMembershipBody = z.infer<typeof patchMembershipSchema>
export type CreateUserBody = z.infer<typeof createUserSchema>
export type ShiftCreateBody = z.infer<typeof shiftCreateSchema>
export type ShiftUpdateBody = z.infer<typeof shiftUpdateSchema>
export type BulkShiftBody = z.infer<typeof bulkShiftSchema>
export type NoteCreateBody = z.infer<typeof noteCreateSchema>
export type NoteApproveBody = z.infer<typeof noteApproveSchema>
export type HolidayCreateBody = z.infer<typeof holidayCreateSchema>
export type HolidayPatchBody = z.infer<typeof holidayPatchSchema>
export type HolidayPutBody = z.infer<typeof holidayPutSchema>
export type SwapCreateBody = z.infer<typeof swapCreateSchema>
export type SwapMessageBody = z.infer<typeof swapMessageSchema>
export type TeamCreateBody = z.infer<typeof teamCreateSchema>
export type TeamDeleteBody = z.infer<typeof teamDeleteSchema>
export type ShiftTypeBody = z.infer<typeof shiftTypeBodySchema>
export type NotificationSettingsBody = z.infer<typeof notificationSettingsSchema>
export type NotificationPreferencesBody = z.infer<typeof notificationPreferencesSchema>
export type UserRoleUpdateBody = z.infer<typeof userRoleUpdateSchema>

import { z } from 'zod'

export const patchUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
  currentUserId: z.string().optional(),
})

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['LEADER', 'EMPLOYEE']),
  currentUserId: z.string().optional(),
})

export const patchMembershipSchema = z.object({
  role: z.enum(['LEADER', 'EMPLOYEE']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  currentUserId: z.string().optional(),
})

export const createUserSchema = z.object({
  name: z.string().min(1, 'Navn er påkrevd'),
  email: z.string().email('Ugyldig e-post'),
  teamId: z.string().min(1, 'Team er påkrevd'),
  role: z.enum(['ADMIN', 'LEADER', 'EMPLOYEE']),
  currentUserId: z.string().optional(),
})

export type PatchUserStatusBody = z.infer<typeof patchUserStatusSchema>
export type AddMemberBody = z.infer<typeof addMemberSchema>
export type PatchMembershipBody = z.infer<typeof patchMembershipSchema>
export type CreateUserBody = z.infer<typeof createUserSchema>

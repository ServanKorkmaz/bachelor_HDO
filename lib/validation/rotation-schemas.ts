import { z } from 'zod'
import { parse, isValid } from 'date-fns'

const id = z.string().min(1)

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ugyldig dato (YYYY-MM-DD)')
  .refine((s) => isValid(parse(s, 'yyyy-MM-dd', new Date())), 'Ugyldig dato')

/** One row in the pattern grid: assigns a shift type to (employee, week, day). */
const rotationSlotSchema = z.object({
  userId: id,
  weekIndex: z.number().int().min(0).max(7),     // < weeks; refined per-pattern below
  dayOfWeek: z.number().int().min(1).max(7),     // ISO 8601
  shiftTypeId: id,
})

const baseRotationPatternSchema = z.object({
  teamId: id,
  name: z.string().min(1, 'Navn er påkrevd').max(100),
  weeks: z.number().int().min(1).max(8),
  slots: z.array(rotationSlotSchema).max(500),   // generous cap for 10 emp x 8 wks x 7 days
})

/**
 * Cross-field check: every slot's weekIndex must be < weeks.
 */
function refinePattern<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (d: { weeks: number; slots: Array<{ weekIndex: number }> }) =>
      d.slots.every((s) => s.weekIndex < d.weeks),
    { message: 'weekIndex må være mindre enn weeks', path: ['slots'] }
  )
}

export const rotationPatternCreateSchema = refinePattern(baseRotationPatternSchema)
export const rotationPatternUpdateSchema = refinePattern(baseRotationPatternSchema)

export const rotationGenerateSchema = z.object({
  startMonday: dateString,
  weeks: z.number().int().min(1).max(52),
})

export type RotationSlot = z.infer<typeof rotationSlotSchema>
export type RotationPatternCreateBody = z.infer<typeof rotationPatternCreateSchema>
export type RotationPatternUpdateBody = z.infer<typeof rotationPatternUpdateSchema>
export type RotationGenerateBody = z.infer<typeof rotationGenerateSchema>

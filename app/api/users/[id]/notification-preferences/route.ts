import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { notificationPreferencesSchema } from '@/lib/validation/schemas'

/**
 * Get notification preferences for a user. Self or admin only — these settings
 * are personal and shouldn't leak between accounts.
 */
export const GET = withAuth<{ id: string }>(async (_request, ctx) => {
  try {
    const userId = ctx.params.id
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    if (userId !== ctx.userId && ctx.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let prefs = await prisma.userNotificationPreference.findUnique({
      where: { userId },
    })

    if (!prefs) {
      prefs = await prisma.userNotificationPreference.create({
        data: {
          userId,
          shiftChangesEmail: true,
          shiftChangesSms: false,
          swapEmail: true,
          swapSms: false,
          noteEmail: true,
          noteSms: false,
        },
      })
    }

    return NextResponse.json(prefs)
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    )
  }
})

/** Update notification preferences for a user. Self or admin only. */
export const PUT = withAuth<{ id: string }>(async (request, ctx) => {
  try {
    const userId = ctx.params.id
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    if (userId !== ctx.userId && ctx.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = await parseJsonBody(request, notificationPreferencesSchema)
    if ('error' in parsed) return parsed.error
    const {
      shiftChangesEmail,
      shiftChangesSms,
      swapEmail,
      swapSms,
      noteEmail,
      noteSms,
    } = parsed.data

    const prefs = await prisma.userNotificationPreference.upsert({
      where: { userId },
      update: {
        ...(shiftChangesEmail !== undefined && { shiftChangesEmail }),
        ...(shiftChangesSms !== undefined && { shiftChangesSms }),
        ...(swapEmail !== undefined && { swapEmail }),
        ...(swapSms !== undefined && { swapSms }),
        ...(noteEmail !== undefined && { noteEmail }),
        ...(noteSms !== undefined && { noteSms }),
      },
      create: {
        userId,
        shiftChangesEmail: shiftChangesEmail ?? true,
        shiftChangesSms: shiftChangesSms ?? false,
        swapEmail: swapEmail ?? true,
        swapSms: swapSms ?? false,
        noteEmail: noteEmail ?? true,
        noteSms: noteSms ?? false,
      },
    })

    return NextResponse.json(prefs)
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    )
  }
})

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Get notification preferences for a user (create defaults if missing). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
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
}

/** Update notification preferences for a user. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const body = await request.json()
    const {
      shiftChangesEmail,
      shiftChangesSms,
      swapEmail,
      swapSms,
      noteEmail,
      noteSms,
    } = body

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
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertTeamMember, withAuth } from '@/lib/auth/withAuth'
import { parseJsonBody } from '@/lib/validation/parseJson'
import { notificationSettingsSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** Get notification settings for a team. Members may read; defaults are created lazily. */
export const GET = withAuth(async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const forbidden = await assertTeamMember(ctx, teamId)
    if (forbidden) return forbidden

    let settings = await prisma.notificationSettings.findUnique({
      where: { teamId },
    })

    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: {
          teamId,
          emailEnabled: true,
          smsEndpoint: null,
        },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    return NextResponse.json({ error: 'Failed to fetch notification settings' }, { status: 500 })
  }
})

/** Upsert notification settings for a team. Only ADMIN/LEADER of the team. */
export const PUT = withAuth(async (request, ctx) => {
  try {
    const parsed = await parseJsonBody(request, notificationSettingsSchema)
    if ('error' in parsed) return parsed.error
    const { teamId, emailEnabled, smsEndpoint } = parsed.data

    const forbidden = await assertTeamMember(ctx, teamId, ['ADMIN', 'LEADER'])
    if (forbidden) return forbidden

    const settings = await prisma.notificationSettings.upsert({
      where: { teamId },
      update: {
        emailEnabled: emailEnabled !== undefined ? emailEnabled : true,
        smsEndpoint: smsEndpoint || null,
      },
      create: {
        teamId,
        emailEnabled: emailEnabled !== undefined ? emailEnabled : true,
        smsEndpoint: smsEndpoint || null,
      },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 })
  }
})

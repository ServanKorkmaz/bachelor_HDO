import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamId = searchParams.get('teamId')

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    let settings = await prisma.notificationSettings.findUnique({
      where: { teamId },
    })

    if (!settings) {
      // Create default settings if they don't exist
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
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { teamId, emailEnabled, smsEndpoint } = body

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

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
}


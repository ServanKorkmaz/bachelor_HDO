import { PrismaClient } from '@prisma/client'
import { addDays, parse, format } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Clean existing data (order: audit log, then memberships, then rest; users/teams cascade to memberships)
  await prisma.auditLog.deleteMany()
  await prisma.teamMembership.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.swapRequest.deleteMany()
  await prisma.note.deleteMany()
  await prisma.shift.deleteMany()
  await prisma.shiftType.deleteMany()
  await prisma.userNotificationPreference.deleteMany()
  await prisma.user.deleteMany()
  await prisma.notificationSettings.deleteMany()
  await prisma.team.deleteMany()

  // Create team
  const team = await prisma.team.create({
    data: {
      name: 'HDO - Turnus',
    },
  })

  console.log('✅ Created team:', team.name)

  // Create notification settings
  await prisma.notificationSettings.create({
    data: {
      teamId: team.id,
      emailEnabled: true,
      smsEndpoint: null,
    },
  })

  // Create shift types
  const shiftTypes = await Promise.all([
    prisma.shiftType.create({
      data: {
        code: 'Fri',
        label: 'Fri',
        color: '#90EE90', // Light green
        defaultStartTime: '00:00',
        defaultEndTime: '00:00',
        crossesMidnight: false,
      },
    }),
    prisma.shiftType.create({
      data: {
        code: 'Dag',
        label: 'Dag 08-16.00',
        color: '#9ACD32', // Yellow-green
        defaultStartTime: '08:00',
        defaultEndTime: '16:00',
        crossesMidnight: false,
      },
    }),
    prisma.shiftType.create({
      data: {
        code: 'Dag2',
        label: 'Dag 08.00-17.10',
        color: '#9ACD32',
        defaultStartTime: '08:00',
        defaultEndTime: '17:10',
        crossesMidnight: false,
      },
    }),
    prisma.shiftType.create({
      data: {
        code: 'N1',
        label: 'N1 22.45-08.15',
        color: '#CD853F', // Orange-brown
        defaultStartTime: '22:45',
        defaultEndTime: '08:15',
        crossesMidnight: true,
      },
    }),
    prisma.shiftType.create({
      data: {
        code: 'N2',
        label: 'N2 20.00-08.15',
        color: '#CD853F',
        defaultStartTime: '20:00',
        defaultEndTime: '08:15',
        crossesMidnight: true,
      },
    }),
    prisma.shiftType.create({
      data: {
        code: 'K1',
        label: 'K1 15.00-23.00',
        color: '#191970', // Dark blue
        defaultStartTime: '15:00',
        defaultEndTime: '23:00',
        crossesMidnight: false,
      },
    }),
    prisma.shiftType.create({
      data: {
        code: 'D2',
        label: 'D2 08.00-20.15',
        // Darker slate-grey so white text reaches WCAG AA 4.5:1 contrast.
        // The previous #808080 was at the perceptual midpoint where
        // neither white nor black text passes 4.5:1.
        color: '#4B5563',
        defaultStartTime: '08:00',
        defaultEndTime: '20:15',
        crossesMidnight: false,
      },
    }),
  ])

  console.log('✅ Created shift types:', shiftTypes.length)

  // Create users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Admin',
        email: 'admin@hdo.no',
        role: 'ADMIN',
        teamId: team.id,
      },
    }),
    // Microsoft Entra test account used for the manual sign-in smoke test
    // (Task 20 in plans/2026-05-17-azure-ad-auth.md). The email must exactly
    // match the Entra account's primary email so the callback handler can
    // match by email on first login and persist azureOid afterwards.
    prisma.user.create({
      data: {
        name: 'Bachelor Test',
        email: 'bach-turnus@hdono.onmicrosoft.com',
        role: 'ADMIN',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Leder',
        email: 'leader@hdo.no',
        role: 'LEADER',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Kari Nordmann',
        email: 'kari.nordmann@hdo.no',
        role: 'EMPLOYEE',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Ole Hansen',
        email: 'ole.hansen@hdo.no',
        role: 'EMPLOYEE',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Per Olsen',
        email: 'per.olsen@hdo.no',
        role: 'EMPLOYEE',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Anne Berg',
        email: 'anne.berg@hdo.no',
        role: 'EMPLOYEE',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Lars Dahl',
        email: 'lars.dahl@hdo.no',
        role: 'EMPLOYEE',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Ingrid Larsen',
        email: 'ingrid.larsen@hdo.no',
        role: 'EMPLOYEE',
        teamId: team.id,
      },
    }),
  ])

  console.log('✅ Created users:', users.length)

  // Backfill team memberships so Admin Users page shows one team/role per user
  for (const user of users) {
    await prisma.teamMembership.upsert({
      where: {
        userId_teamId: { userId: user.id, teamId: user.teamId },
      },
      create: {
        userId: user.id,
        teamId: user.teamId,
        role: user.role === 'ADMIN' ? 'LEADER' : user.role,
        status: 'active',
      },
      update: {},
    })
  }
  console.log('✅ Backfilled team memberships')

  // Seed shifts for 6 weeks starting 2026-04-27 (2 weeks before demo date)
  const weekStart = parse('2026-04-27', 'yyyy-MM-dd', new Date())
  const employees = users.filter(u => u.role === 'EMPLOYEE')

  const employeePatterns = [
    // Kari Nordmann: Dag Mon-Wed, D2 Sat-Sun
    [
      { day: 0, shiftType: shiftTypes[1] },
      { day: 1, shiftType: shiftTypes[1] },
      { day: 2, shiftType: shiftTypes[1] },
      { day: 5, shiftType: shiftTypes[6] },
      { day: 6, shiftType: shiftTypes[6] },
    ],
    // Ole Hansen: N1 Mon-Wed
    [
      { day: 0, shiftType: shiftTypes[3] },
      { day: 1, shiftType: shiftTypes[3] },
      { day: 2, shiftType: shiftTypes[3] },
    ],
    // Per Olsen: N1 Thu-Fri, N2 Sat-Sun
    [
      { day: 3, shiftType: shiftTypes[3] },
      { day: 4, shiftType: shiftTypes[3] },
      { day: 5, shiftType: shiftTypes[4] },
      { day: 6, shiftType: shiftTypes[4] },
    ],
    // Anne Berg: Dag/Dag2 alternating Mon-Fri
    [
      { day: 0, shiftType: shiftTypes[1] },
      { day: 1, shiftType: shiftTypes[2] },
      { day: 2, shiftType: shiftTypes[1] },
      { day: 3, shiftType: shiftTypes[2] },
      { day: 4, shiftType: shiftTypes[1] },
    ],
    // Lars Dahl: K1 Mon-Fri
    [
      { day: 0, shiftType: shiftTypes[5] },
      { day: 1, shiftType: shiftTypes[5] },
      { day: 2, shiftType: shiftTypes[5] },
      { day: 3, shiftType: shiftTypes[5] },
      { day: 4, shiftType: shiftTypes[5] },
    ],
    // Ingrid Larsen: K1 Tue-Thu, D2 Sat-Sun
    [
      { day: 1, shiftType: shiftTypes[5] },
      { day: 2, shiftType: shiftTypes[5] },
      { day: 3, shiftType: shiftTypes[5] },
      { day: 5, shiftType: shiftTypes[6] },
      { day: 6, shiftType: shiftTypes[6] },
    ],
  ]

  for (let week = 0; week < 6; week++) {
    const currentWeekStart = addDays(weekStart, week * 7)

    for (let empIdx = 0; empIdx < employees.length; empIdx++) {
      const employee = employees[empIdx]
      const pattern = employeePatterns[empIdx]

      for (const shiftData of pattern) {
        const date = addDays(currentWeekStart, shiftData.day)
        const dateStr = format(date, 'yyyy-MM-dd')
        const shiftType = shiftData.shiftType

        let startDateTime = parse(`${dateStr}T${shiftType.defaultStartTime}`, "yyyy-MM-dd'T'HH:mm", new Date())
        let endDateTime = parse(`${dateStr}T${shiftType.defaultEndTime}`, "yyyy-MM-dd'T'HH:mm", new Date())

        if (shiftType.crossesMidnight) {
          endDateTime = addDays(endDateTime, 1)
        }

        await prisma.shift.create({
          data: {
            teamId: team.id,
            userId: employee.id,
            date: dateStr,
            startDateTime,
            endDateTime,
            shiftTypeId: shiftType.id,
          },
        })
      }
    }
  }

  // Create a few notes
  await prisma.note.create({
    data: {
      teamId: team.id,
      createdByUserId: employees[0].id,
      type: 'GENERAL',
      status: 'APPROVED',
      title: 'Viktig informasjon',
      body: 'Denne uken har ikke noen beskjeder.',
      dateFrom: '2026-05-04',
      dateTo: '2026-05-10',
      visibility: 'ALL',
    },
  })

  await prisma.note.create({
    data: {
      teamId: team.id,
      createdByUserId: employees[1].id,
      type: 'ABSENCE',
      status: 'PENDING',
      title: 'Forespørsel om fravær',
      body: 'Ønsker å ta fri 19-20 mai',
      dateFrom: '2026-05-19',
      dateTo: '2026-05-20',
      visibility: 'ALL',
    },
  })

  console.log('✅ Created notes')

  console.log('🎉 Seed completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


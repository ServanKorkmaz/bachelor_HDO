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
        color: '#808080', // Grey
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
        name: 'Admin User',
        email: 'admin@hdo.no',
        role: 'ADMIN',
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Leader User',
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

  // Seed shifts for 4 weeks starting from 2026-03-09 (Monday, current week)
  const weekStart = parse('2026-03-09', 'yyyy-MM-dd', new Date())
  const employees = users.filter(u => u.role === 'EMPLOYEE')

  // Week 1 shifts (Kari Nordmann pattern)
  const week1Employee = employees[0] // Kari Nordmann
  const week1Shifts = [
    { day: 0, shiftType: shiftTypes[1] }, // Mon - Dag
    { day: 1, shiftType: shiftTypes[1] }, // Tue - Dag
    { day: 2, shiftType: shiftTypes[1] }, // Wed - Dag
    { day: 3, shiftType: shiftTypes[0] }, // Thu - Fri
    { day: 4, shiftType: shiftTypes[0] }, // Fri - Fri
    { day: 5, shiftType: shiftTypes[6] }, // Sat - D2
    { day: 6, shiftType: shiftTypes[6] }, // Sun - D2
  ]

  for (const shiftData of week1Shifts) {
    const date = addDays(weekStart, shiftData.day)
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
        userId: week1Employee.id,
        date: dateStr,
        startDateTime,
        endDateTime,
        shiftTypeId: shiftType.id,
      },
    })
  }

  // Week 2 shifts (Ole Hansen pattern)
  const week2Start = addDays(weekStart, 7)
  const week2Employee = employees[1] // Ole Hansen
  const week2Shifts = [
    { day: 0, shiftType: shiftTypes[3] }, // Mon - N1
    { day: 1, shiftType: shiftTypes[3] }, // Tue - N1
    { day: 2, shiftType: shiftTypes[3] }, // Wed - N1
    { day: 3, shiftType: shiftTypes[0] }, // Thu - Fri
    { day: 4, shiftType: shiftTypes[0] }, // Fri - Fri
    { day: 5, shiftType: shiftTypes[0] }, // Sat - Fri
    { day: 6, shiftType: shiftTypes[0] }, // Sun - Fri
  ]

  for (const shiftData of week2Shifts) {
    const date = addDays(week2Start, shiftData.day)
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
        userId: week2Employee.id,
        date: dateStr,
        startDateTime,
        endDateTime,
        shiftTypeId: shiftType.id,
      },
    })
  }

  // Week 3 shifts (Per Olsen pattern)
  const week3Start = addDays(weekStart, 14)
  const week3Employee = employees[2] // Per Olsen
  const week3Shifts = [
    { day: 0, shiftType: shiftTypes[0] }, // Mon - Fri
    { day: 1, shiftType: shiftTypes[0] }, // Tue - Fri
    { day: 2, shiftType: shiftTypes[0] }, // Wed - Fri
    { day: 3, shiftType: shiftTypes[3] }, // Thu - N1
    { day: 4, shiftType: shiftTypes[3] }, // Fri - N1
    { day: 5, shiftType: shiftTypes[4] }, // Sat - N2
    { day: 6, shiftType: shiftTypes[4] }, // Sun - N2
  ]

  for (const shiftData of week3Shifts) {
    const date = addDays(week3Start, shiftData.day)
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
        userId: week3Employee.id,
        date: dateStr,
        startDateTime,
        endDateTime,
        shiftTypeId: shiftType.id,
      },
    })
  }

  // Week 4 shifts (Lars Dahl pattern)
  const week4Start = addDays(weekStart, 21)
  const week4Employee = employees[4] // Lars Dahl
  const week4Shifts = [
    { day: 0, shiftType: shiftTypes[5] }, // Mon - K1
    { day: 1, shiftType: shiftTypes[5] }, // Tue - K1
    { day: 2, shiftType: shiftTypes[5] }, // Wed - K1
    { day: 3, shiftType: shiftTypes[5] }, // Thu - K1
    { day: 4, shiftType: shiftTypes[5] }, // Fri - K1
    { day: 5, shiftType: shiftTypes[0] }, // Sat - Fri
    { day: 6, shiftType: shiftTypes[0] }, // Sun - Fri
  ]

  for (const shiftData of week4Shifts) {
    const date = addDays(week4Start, shiftData.day)
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
        userId: week4Employee.id,
        date: dateStr,
        startDateTime,
        endDateTime,
        shiftTypeId: shiftType.id,
      },
    })
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
      dateFrom: '2026-01-05',
      dateTo: '2026-01-11',
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
      body: 'Ønsker å ta fri 15-16 januar',
      dateFrom: '2026-01-15',
      dateTo: '2026-01-16',
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


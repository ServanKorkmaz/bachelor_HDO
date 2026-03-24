import { endOfMonth, format, startOfMonth } from 'date-fns'
import { prisma } from '@/lib/prisma'
import MonthPageClient from '@/components/month/MonthPageClient'

export const dynamic = 'force-dynamic'

interface MonthPageProps {
  searchParams?: {
    date?: string
    teamId?: string
  }
}

/** Monthly calendar view with SSR initial data and client-side TanStack refetching. */
export default async function MonthPage({ searchParams }: MonthPageProps) {
  const parsedDate = searchParams?.date ? new Date(searchParams.date) : new Date()
  const selectedDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate

  const monthStart = startOfMonth(selectedDate)
  const monthEnd = endOfMonth(selectedDate)
  const startDate = format(monthStart, 'yyyy-MM-dd')
  const endDate = format(monthEnd, 'yyyy-MM-dd')

  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  const selectedTeamId =
    (searchParams?.teamId && teams.some(team => team.id === searchParams.teamId)
      ? searchParams.teamId
      : teams[0]?.id) || ''

  const initialShifts = selectedTeamId
    ? await prisma.shift.findMany({
        where: {
          teamId: selectedTeamId,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          shiftType: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { date: 'asc' },
          { startDateTime: 'asc' },
        ],
      })
    : []

  const serializedInitialShifts = initialShifts.map(shift => ({
    ...shift,
    startDateTime: shift.startDateTime.toISOString(),
    endDateTime: shift.endDateTime.toISOString(),
    comment: shift.comment ?? undefined,
  }))

  return (
    <MonthPageClient
      initialDate={format(selectedDate, 'yyyy-MM-dd')}
      initialTeams={teams}
      initialTeamId={selectedTeamId}
      initialShifts={serializedInitialShifts}
    />
  )
}


// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Stub the ShiftModal so we don't need to mock useQuery cascades for shift types
vi.mock('@/components/schedule/ShiftModal', () => ({
  ShiftModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="shift-modal">
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

import { WeekGrid } from '@/components/schedule/WeekGrid'
import type { Shift } from '@/components/schedule/ShiftModal'

const weekDates = [
  new Date('2026-04-27'),
  new Date('2026-04-28'),
  new Date('2026-04-29'),
  new Date('2026-04-30'),
  new Date('2026-05-01'),
  new Date('2026-05-02'),
  new Date('2026-05-03'),
]

const users = [
  { id: 'u1', name: 'Alice Test', role: 'EMPLOYEE' as const, teamId: 't1' },
  { id: 'u2', name: 'Bob Test', role: 'EMPLOYEE' as const, teamId: 't1' },
]

const baseShift: Shift = {
  id: 's1',
  userId: 'u1',
  date: '2026-04-27',
  startDateTime: '2026-04-27T08:00:00.000Z',
  endDateTime: '2026-04-27T16:00:00.000Z',
  user: { id: 'u1', name: 'Alice Test' },
  shiftType: {
    id: 'st1',
    code: 'D',
    label: 'Dag',
    color: '#9ACD32',
    defaultStartTime: '08:00',
    defaultEndTime: '16:00',
    crossesMidnight: false,
  },
}

function renderGrid(props: Partial<Parameters<typeof WeekGrid>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WeekGrid
        weekDates={weekDates}
        users={users}
        shifts={[baseShift]}
        currentUser={null}
        {...props}
      />
    </QueryClientProvider>
  )
}

afterEach(() => cleanup())

describe('WeekGrid', () => {
  it('renders one row per user and shows their names', () => {
    renderGrid()
    expect(screen.getByText('Alice Test')).toBeInTheDocument()
    expect(screen.getByText('Bob Test')).toBeInTheDocument()
  })

  it('renders a shift chip with label and time range', () => {
    renderGrid()
    expect(screen.getByText('Dag')).toBeInTheDocument()
    expect(screen.getByText(/\d{2}:\d{2} - \d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('shows the weekly sum for a user with a single 8h shift', () => {
    renderGrid()
    // formatHours(8) => "8:00"; Alice (u1) has the 8h shift
    expect(screen.getByText('8:00')).toBeInTheDocument()
  })

  it('opens the shift modal when clicking an existing shift cell', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(screen.getByText('Dag'))
    expect(screen.getByRole('dialog', { name: 'shift-modal' })).toBeInTheDocument()
  })

  it('calls onSelectUser when clicking a user name', async () => {
    const onSelectUser = vi.fn()
    const user = userEvent.setup()
    renderGrid({ onSelectUser })
    await user.click(screen.getByText('Alice Test'))
    expect(onSelectUser).toHaveBeenCalledWith('u1')
  })

  it('highlights the row for highlightedUserId', () => {
    renderGrid({ highlightedUserId: 'u2' })
    const bobCell = screen.getByText('Bob Test').closest('td')
    expect(bobCell?.className).toContain('bg-primary/10')
  })
})

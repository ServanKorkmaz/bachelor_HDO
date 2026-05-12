// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockAxios } = vi.hoisted(() => ({
  mockAxios: vi.fn(),
}))

vi.mock('@/lib/axios', () => ({
  axiosInstance: Object.assign(mockAxios, {
    get: (url: string) => mockAxios({ method: 'GET', url }),
  }),
}))

import { ShiftModal, type Shift } from '@/components/schedule/ShiftModal'
import { useAuth } from '@/lib/auth/mockAuth'

const shiftTypes = [
  { id: 'st1', code: 'D', label: 'Dag', color: '#9ACD32', defaultStartTime: '08:00', defaultEndTime: '16:00', crossesMidnight: false },
  { id: 'st2', code: 'K', label: 'Kveld', color: '#191970', defaultStartTime: '15:00', defaultEndTime: '23:00', crossesMidnight: false },
]

const users = [
  { id: 'u1', name: 'Alice Test', role: 'EMPLOYEE' },
  { id: 'u2', name: 'Bob Test', role: 'EMPLOYEE' },
]

const existingShift: Shift = {
  id: 's1',
  userId: 'u1',
  date: '2026-04-27',
  startDateTime: '2026-04-27T08:00:00.000Z',
  endDateTime: '2026-04-27T16:00:00.000Z',
  user: { id: 'u1', name: 'Alice Test' },
  shiftType: shiftTypes[0],
  comment: 'Vakt med pause',
}

function renderModal(props: Partial<Parameters<typeof ShiftModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ShiftModal
        shift={null}
        date={'2026-04-27'}
        userId={'u1'}
        onClose={() => {}}
        currentUser={null}
        {...props}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAxios.mockImplementation(async (config: { method: string; url: string }) => {
    if (config.url === '/api/shift-types') return { data: shiftTypes }
    if (config.url === '/api/users') return { data: users }
    return { data: {} }
  })
  // Start each test signed-out by default; individual tests set roles below
  useAuth.setState({ currentUser: null })
})

afterEach(() => {
  cleanup()
  useAuth.setState({ currentUser: null })
})

describe('ShiftModal', () => {
  it('renders dialog with the selected date', async () => {
    renderModal()
    expect(await screen.findByText(/Detaljer for dag/)).toBeInTheDocument()
    expect(screen.getAllByText(/27\.04\.2026/).length).toBeGreaterThan(0)
  })

  it('hides Save/Delete actions for non-editor (employee) users', async () => {
    useAuth.setState({
      currentUser: { id: 'u1', name: 'Alice', email: 'a@a.no', role: 'EMPLOYEE', teamId: 't1' },
    })
    renderModal({ shift: existingShift })

    expect(await screen.findByRole('button', { name: 'Lukk' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lagre/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Slett' })).not.toBeInTheDocument()
  })

  it('shows Save and Delete actions for a LEADER editing an existing shift', async () => {
    useAuth.setState({
      currentUser: { id: 'leader-1', name: 'Leader', email: 'l@l.no', role: 'LEADER', teamId: 't1' },
    })
    renderModal({ shift: existingShift })

    expect(await screen.findByRole('button', { name: /Lagre/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Slett' })).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderModal({ onClose })

    await user.click(await screen.findByRole('button', { name: 'Lukk' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders the existing shift comment in read-only mode for employees', async () => {
    useAuth.setState({
      currentUser: { id: 'u1', name: 'Alice', email: 'a@a.no', role: 'EMPLOYEE', teamId: 't1' },
    })
    renderModal({ shift: existingShift })
    expect(await screen.findByText('Vakt med pause')).toBeInTheDocument()
  })
})

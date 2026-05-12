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
    post: (url: string, data: unknown) => mockAxios({ method: 'POST', url, data }),
  }),
}))

import { BulkShiftModal } from '@/components/BulkShiftModal'
import { useAuth } from '@/lib/auth/mockAuth'

const shiftTypes = [
  { id: 'st1', label: 'Dag', defaultStartTime: '08:00', defaultEndTime: '16:00', crossesMidnight: false },
  { id: 'st2', label: 'Kveld', defaultStartTime: '15:00', defaultEndTime: '23:00', crossesMidnight: false },
]
const users = [
  { id: 'u1', name: 'Alice Test', teamId: 't1' },
  { id: 'u2', name: 'Bob Test', teamId: 't1' },
]

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <BulkShiftModal teamId={'t1'} onClose={onClose} />
      </QueryClientProvider>
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAxios.mockImplementation(async (config: { method: string; url: string }) => {
    if (config.url === '/api/shift-types') return { data: shiftTypes }
    if (config.url?.startsWith('/api/users')) return { data: users }
    if (config.url?.startsWith('/api/shifts')) return { data: [] }
    return { data: {} }
  })
  useAuth.setState({
    currentUser: { id: 'admin-1', name: 'Admin', email: 'a@a.no', role: 'ADMIN', teamId: 't1' },
  })
})

afterEach(() => {
  cleanup()
  useAuth.setState({ currentUser: null })
})

describe('BulkShiftModal', () => {
  it('renders the bulk-edit dialog title and description', async () => {
    renderModal()
    expect(await screen.findByText('Bulk vaktendring')).toBeInTheDocument()
    expect(screen.getByText(/Opprett, oppdater eller slett/i)).toBeInTheDocument()
  })

  it('starts with zero rows and shows the empty-state hint', async () => {
    renderModal()
    expect(await screen.findByText(/0 rad\(er\) valgt/)).toBeInTheDocument()
    expect(screen.getByText(/Ingen rader lagt til ennå/)).toBeInTheDocument()
  })

  it('adds a row when "Legg til rad" is clicked', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('button', { name: 'Legg til rad' }))
    // Empty-state hint disappears once a row exists
    expect(screen.queryByText(/Ingen rader lagt til ennå/)).not.toBeInTheDocument()
  })

  it('calls onClose when "Avbryt" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderModal(onClose)
    const cancel = await screen.findByRole('button', { name: 'Avbryt' })
    await user.click(cancel)
    expect(onClose).toHaveBeenCalled()
  })

  it('disables submit button when no rows are added', async () => {
    renderModal()
    const submit = await screen.findByRole('button', { name: 'Utfør' })
    expect(submit).toBeDisabled()
  })
})

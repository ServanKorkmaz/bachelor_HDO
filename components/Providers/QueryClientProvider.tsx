'use client'

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Singleton QueryClient instance for the application. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

/** Provider component for TanStack Query. Wraps the application to enable useQuery and useMutation. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

export { queryClient }

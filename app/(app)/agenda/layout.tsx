// Opt the agenda route out of static prerendering. The client component
// underneath reads URL state via `useSearchParams()`, which Next 14 refuses
// to prerender unless wrapped in Suspense. The view is auth-gated and
// entirely data-driven from the client, so there is nothing useful to
// prerender anyway. Same pattern as app/(app)/standard/layout.tsx.
export const dynamic = 'force-dynamic'

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

import { Navigation } from '@/components/layout/Navigation'
import { Toaster } from '@/components/ui/toaster'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto py-6 px-4">
        {children}
      </main>
      <Toaster />
    </div>
  )
}


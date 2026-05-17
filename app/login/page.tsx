import Link from 'next/link'
import { isSafeInternalPath } from '@/lib/auth/safeRedirect'
import { HdoLogo } from '@/components/brand/HdoLogo'
import { MicrosoftLogo } from '@/components/brand/MicrosoftLogo'

const ERROR_MESSAGES: Record<string, string> = {
  expired: 'Innloggingen utløp. Prøv på nytt.',
  invalid: 'Ugyldig innloggingsforespørsel.',
  tenant: 'Ikke autorisert tenant.',
  unknown_user: 'Ingen tilgang. Kontakt administrator.',
  inactive: 'Kontoen er deaktivert. Kontakt administrator.',
  failed: 'Microsoft-innlogging feilet. Prøv igjen.',
}

interface PageProps {
  searchParams: { error?: string; from?: string }
}

export default function LoginPage({ searchParams }: PageProps) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null
  const fromParam =
    typeof searchParams.from === 'string' && isSafeInternalPath(searchParams.from)
      ? `?from=${encodeURIComponent(searchParams.from)}`
      : ''

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <HdoLogo className="h-10 w-auto text-foreground" />
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-foreground">Logg inn</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bruk din Microsoft-konto for å fortsette til turnusplanen.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground"
            >
              {errorMessage}
            </div>
          )}

          <Link
            href={`/api/auth/azure/login${fromParam}`}
            className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <MicrosoftLogo size={18} />
            <span>Logg inn med Microsoft</span>
          </Link>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Trenger du hjelp? Kontakt administrator.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          HDO Turnusplan
        </p>
      </div>
    </main>
  )
}

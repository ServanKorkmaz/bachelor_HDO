import Link from 'next/link'

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
    typeof searchParams.from === 'string' && searchParams.from.startsWith('/')
      ? `?from=${encodeURIComponent(searchParams.from)}`
      : ''

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground mb-6 text-center">
          Logg inn
        </h1>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <Link
          href={`/api/auth/azure/login${fromParam}`}
          className="block w-full rounded-md bg-primary px-4 py-3 text-center text-primary-foreground font-medium hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Logg inn med Microsoft
        </Link>
      </div>
    </main>
  )
}

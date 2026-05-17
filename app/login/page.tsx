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
        <div className="rounded-xl bg-white p-8 shadow-2xl ring-1 ring-black/5">
          <div className="mb-6 flex justify-center">
            <HdoLogo className="h-9 w-auto text-[#003087]" />
          </div>

          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-zinc-900">Logg inn</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Bruk din Microsoft-konto for å fortsette til turnusplanen.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}

          <Link
            href={`/api/auth/azure/login${fromParam}`}
            className="flex w-full items-center justify-center gap-3 rounded-md bg-[#2f2f2f] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1f1f1f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003087]"
          >
            <MicrosoftLogo size={18} />
            <span>Logg inn med Microsoft</span>
          </Link>

          <p className="mt-6 text-center text-xs text-zinc-500">
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

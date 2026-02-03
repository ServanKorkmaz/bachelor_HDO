import { redirect } from 'next/navigation'

/** Brukere og tilgang er flyttet til Innstillinger > Brukere. */
export default function SettingsUsersRedirect() {
  redirect('/admin/users')
}

import { redirect } from 'next/navigation'

/** Innstillinger: send til admin-hub (alt er samlet der). */
export default function SettingsPage() {
  redirect('/admin')
}

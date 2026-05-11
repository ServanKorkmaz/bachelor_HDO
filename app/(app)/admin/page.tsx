"use client"

import Link from 'next/link'
import { Users, Calendar, Settings, Building2, FileText, UserCircle } from 'lucide-react'

/** Admin landing page with links to management sections. */
export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Administrasjon</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/teams">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <Building2 className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Team</h2>
            <p className="text-sm text-muted-foreground">Administrer team</p>
          </div>
        </Link>

        <Link href="/admin/users">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <Users className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Brukere og tilgang</h2>
            <p className="text-sm text-muted-foreground">Legg til brukere, roller, team og aktiver/deaktiver</p>
          </div>
        </Link>

        <Link href="/admin/shift-types">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <Calendar className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Vakttyper</h2>
            <p className="text-sm text-muted-foreground">Administrer vakttyper</p>
          </div>
        </Link>

        <Link href="/admin/settings">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <Settings className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Varslinger</h2>
            <p className="text-sm text-muted-foreground">Varslingsinnstillinger</p>
          </div>
        </Link>

        <Link href="/admin/audit">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <FileText className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Revisjonslogg</h2>
            <p className="text-sm text-muted-foreground">Se hvem som endret brukere og tilgang</p>
          </div>
        </Link>

        <Link href="/settings/profile">
          <div className="p-6 bg-card rounded-lg border hover:bg-accent transition-colors cursor-pointer">
            <UserCircle className="h-8 w-8 mb-2" />
            <h2 className="text-lg font-semibold mb-1">Min profil</h2>
            <p className="text-sm text-muted-foreground">Se din brukerinformasjon</p>
          </div>
        </Link>
        
        {/* Holiday requests are reachable from the main navigation for all users; remove
            the duplicate admin-only card here to avoid confusion. Admins can still
            review requests via the main menu's Fravær page which shows the admin view. */}
      </div>
    </div>
  )
}


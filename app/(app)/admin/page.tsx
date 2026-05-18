"use client"

import Link from 'next/link'
import { Bell, Building2, Calendar, FileText, LucideIcon, Users } from 'lucide-react'
import { ProfileSection } from '@/components/auth/ProfileSection'

interface AdminCard {
  href: string
  icon: LucideIcon
  title: string
  description: string
}

interface AdminSection {
  title: string
  description: string
  items: AdminCard[]
}

const SECTIONS: AdminSection[] = [
  {
    title: 'Team og brukere',
    description: 'Hvem som tilhører hvilket team og hva de har tilgang til.',
    items: [
      {
        href: '/admin/teams',
        icon: Building2,
        title: 'Team',
        description: 'Opprett og rediger team.',
      },
      {
        href: '/admin/users',
        icon: Users,
        title: 'Brukere og tilgang',
        description: 'Legg til brukere, sett roller og aktiver/deaktiver kontoer.',
      },
    ],
  },
  {
    title: 'Konfigurasjon',
    description: 'Faste oppslagsdata og varselregler.',
    items: [
      {
        href: '/admin/shift-types',
        icon: Calendar,
        title: 'Vakttyper',
        description: 'Definer vakttyper, tider og farger.',
      },
      {
        href: '/admin/settings',
        icon: Bell,
        title: 'Varslinger',
        description: 'E-post og SMS-innstillinger for teamet.',
      },
    ],
  },
  {
    title: 'Logg',
    description: 'Sporbarhet og historikk.',
    items: [
      {
        href: '/admin/audit',
        icon: FileText,
        title: 'Revisjonslogg',
        description: 'Se hvem som endret hva og når.',
      },
    ],
  },
]

/**
 * Admin landing page. Profile sits at the top so admins always see their
 * own account first; the rest of the page is the team-wide admin tooling
 * grouped by purpose. Non-admins reach a slimmer version of this at
 * /settings. Both pages share the ProfileSection component.
 */
export default function AdminPage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold">Innstillinger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Din profil og administrasjon av team, brukere, vakttyper og varslinger.
        </p>
      </header>

      <ProfileSection />

      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {section.description}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-accent/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold leading-tight">{item.title}</h3>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

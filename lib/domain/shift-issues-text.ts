import type { Conflict, Warning } from './shift-issues'

/**
 * Norwegian display text for a hard conflict. Shared between the service
 * layer (where it surfaces as a ServiceError message) and the schedule UI
 * (where it appears in dots and banners) so the two never drift.
 */
export function conflictText(c: Conflict): string {
  switch (c.kind) {
    case 'Holiday':
      return 'Godkjent fravær på denne datoen.'
    case 'Overlap':
      return 'Overlapper i tid med en annen vakt brukeren har.'
    case 'RestPeriod':
      return `Kun ${c.hoursBetween} timer hvile mellom vakter (AML §10-8(1) krever 11).`
    case 'WeeklyRest':
      return `Lengste sammenhengende hvile siste 7 dager er ${c.hoursInWindow} timer (AML §10-8(2) krever 35).`
  }
}

/** Norwegian display text for a soft warning. */
export function warningText(w: Warning): string {
  switch (w.kind) {
    case 'ConsecutiveWorkDays':
      return `${w.streakLength} arbeidsdager på rad — bransjeanbefalingen er maks 5.`
  }
}

/** Short label suitable for a tooltip on a small indicator. */
export function conflictShortLabel(c: Conflict): string {
  switch (c.kind) {
    case 'Holiday':
      return 'Fravær'
    case 'Overlap':
      return 'Overlapp'
    case 'RestPeriod':
      return 'Daglig hvile'
    case 'WeeklyRest':
      return 'Ukentlig hvile'
  }
}

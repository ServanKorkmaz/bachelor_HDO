import { AlertCircle, AlertTriangle } from 'lucide-react'
import { isClean, type ShiftIssues } from '@/lib/domain/shift-issues'
import {
  conflictShortLabel,
  conflictText,
  warningText,
} from '@/lib/domain/shift-issues-text'
import { cn } from '@/lib/utils'

/**
 * Small corner-dot for grid cells. Red when there's a hard conflict,
 * amber when only warnings apply. Tooltip surfaces the first issue's text.
 * Returns null for clean shifts so it can be dropped into a cell
 * unconditionally without an extra check at every call site.
 */
export function ShiftIssueDot({
  issues,
  className,
}: {
  issues: ShiftIssues
  className?: string
}) {
  if (isClean(issues)) return null

  const isHard = issues.hardConflict !== null
  const label = issues.hardConflict
    ? conflictShortLabel(issues.hardConflict)
    : 'Advarsel'
  const tooltip = issues.hardConflict
    ? conflictText(issues.hardConflict)
    : issues.warnings.map(warningText).join(' ')

  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full ring-2 ring-card',
        isHard ? 'bg-destructive' : 'bg-amber-500',
        className
      )}
      title={`${label}: ${tooltip}`}
      aria-label={`${label}: ${tooltip}`}
    />
  )
}

/**
 * Full-width banner used inside the ShiftModal. Renders the hard conflict
 * (if any) first, then any warnings, each on their own row with a matching
 * icon. Returns null for clean issues.
 */
export function ShiftIssueBanner({
  issues,
  className,
}: {
  issues: ShiftIssues
  className?: string
}) {
  if (isClean(issues)) return null

  return (
    <div className={cn('space-y-2', className)}>
      {issues.hardConflict && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <div className="font-semibold text-destructive">
              {conflictShortLabel(issues.hardConflict)}
            </div>
            <div className="text-foreground/90">
              {conflictText(issues.hardConflict)}
            </div>
          </div>
        </div>
      )}
      {issues.warnings.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-foreground/90">{warningText(w)}</div>
        </div>
      ))}
    </div>
  )
}

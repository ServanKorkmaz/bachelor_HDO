interface MicrosoftLogoProps {
  className?: string
  size?: number
}

/**
 * Microsoft four-square brand mark. Used inside the "Logg inn med Microsoft"
 * button per Microsoft's brand guidelines for the "Sign in with Microsoft"
 * pattern: https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-add-branding-in-azure-ad-apps
 *
 * Colours are fixed (orange/green/blue/yellow) — they must not be themed.
 */
export function MicrosoftLogo({ className, size = 18 }: MicrosoftLogoProps) {
  return (
    <svg
      role="img"
      aria-label="Microsoft"
      viewBox="0 0 23 23"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <title>Microsoft</title>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  )
}

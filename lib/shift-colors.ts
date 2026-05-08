import type { CSSProperties } from 'react'

const LIGHT_TEXT = '#F8FAFC'
const DARK_TEXT = '#0F172A'

function normalizeHexColor(color: string): string | null {
  const value = color.trim()
  if (!value.startsWith('#')) return null

  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase()
  }

  if (value.length === 7) {
    return value.toUpperCase()
  }

  return null
}

function withAlpha(hexColor: string, alphaHex: string): string {
  return `${hexColor}${alphaHex}`
}

function isLightColor(hexColor: string): boolean {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)

  // Perceived luminance, scaled 0-255.
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness >= 150
}

/**
 * Build a vivid but readable style for shift chips against dark UI backgrounds.
 */
export function getShiftChipStyle(shiftColor: string): CSSProperties {
  const normalized = normalizeHexColor(shiftColor)

  if (!normalized) {
    return {
      backgroundColor: shiftColor,
      color: LIGHT_TEXT,
    }
  }

  const textColor = isLightColor(normalized) ? DARK_TEXT : LIGHT_TEXT

  return {
    backgroundColor: normalized,
    color: textColor,
    border: `1px solid ${withAlpha(normalized, 'F0')}`,
    boxShadow: `0 3px 10px ${withAlpha(normalized, '66')}`,
  }
}
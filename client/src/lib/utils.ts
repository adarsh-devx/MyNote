/**
 * "Shivam Kumar" -> "SK" — initials for avatar fallbacks.
 * Takes up to two whitespace-separated parts, uppercases each first letter,
 * and falls back to "?" for empty names.
 */
export function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

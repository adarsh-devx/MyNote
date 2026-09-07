/**
 * Minimal, dependency-free class-name merge helper.
 * Stand-in for the shadcn `cn` utility (clsx + tailwind-merge), which this
 * project does not use — the animate-ui components only need plain class
 * joining. Accepts anything (motion's className prop type includes
 * MotionValue placeholders), skips falsy values; later values win.
 */
export function cn(...inputs: unknown[]): string {
  return inputs.filter(Boolean).join(' ')
}

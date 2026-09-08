import type { ReactNode } from 'react'

interface AvatarProps {
  children: ReactNode
  size?: 'md' | 'sm'
}

export function Avatar({ children, size = 'md' }: AvatarProps) {
  return <span className={`avatar avatar-${size}`}>{children}</span>
}

export function AvatarImage({
  src,
  alt = '',
}: {
  src: string
  alt?: string
}) {
  return (
    <img
      className="avatar-image"
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
    />
  )
}

export function AvatarFallback({ children }: { children: ReactNode }) {
  return <span className="avatar-fallback">{children}</span>
}
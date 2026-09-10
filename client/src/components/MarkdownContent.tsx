import { memo, type ReactNode } from 'react'

interface MarkdownContentProps {
  content: string
}

function parseInline(text: string): ReactNode[] {
  // Matches bold (**text**), italic (*text*), and inline code (`code`)
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g
  const parts = text.split(regex)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>
    }
    return part
  })
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
}: MarkdownContentProps) {
  if (!content) return null

  const lines = content.split(/\r?\n/)

  return (
    <div className="note-content-markdown">
      {lines.map((line, idx) => {
        const trimmed = line.trim()

        // Checklist items: - [ ] text or - [x] text
        if (/^-\s*\[([ xX])\]\s+(.*)$/.test(trimmed)) {
          const match = trimmed.match(/^-\s*\[([ xX])\]\s+(.*)$/)
          const isChecked = match ? match[1].toLowerCase() === 'x' : false
          const restText = match ? match[2] : ''
          return (
            <div key={idx} className={`markdown-todo ${isChecked ? 'checked' : ''}`}>
              <span className="todo-box">{isChecked ? '✓' : ''}</span>
              <span>{parseInline(restText)}</span>
            </div>
          )
        }

        // Bullet items: - text or * text
        if (/^[-*]\s+(.*)$/.test(trimmed)) {
          const match = trimmed.match(/^[-*]\s+(.*)$/)
          const restText = match ? match[1] : ''
          return (
            <div key={idx} className="markdown-bullet">
              <span className="bullet-dot">•</span>
              <span>{parseInline(restText)}</span>
            </div>
          )
        }

        // Empty line
        if (trimmed.length === 0) {
          return <div key={idx} className="markdown-spacer" />
        }

        // Regular line
        return <p key={idx} className="markdown-line">{parseInline(line)}</p>
      })}
    </div>
  )
})

/**
 * Lightweight skeleton placeholder that matches the NoteCard layout.
 * Used only during the initial item fetch — never during optimistic mutations.
 */
export function NoteCardSkeleton() {
  return (
    <article className="note-card skeleton-card" aria-hidden="true">
      <div className="card-top">
        <span className="skeleton-pill" />
        <div className="card-actions">
          <span className="skeleton-icon" />
          <span className="skeleton-icon" />
        </div>
      </div>

      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-line skeleton-body-1" />
      <div className="skeleton-line skeleton-body-2" />
    </article>
  )
}

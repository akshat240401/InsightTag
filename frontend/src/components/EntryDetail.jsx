function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function EntryDetail({
  entry,
  error,
  isDeleting,
  isLoading,
  onDelete,
  variant = "standard",
}) {
  const className =
    variant === "featured"
      ? "card detail-card featured-detail"
      : "card detail-card";

  if (isLoading) {
    return (
      <section className={`${className} state-card`} aria-live="polite">
        <span className="spinner spinner-dark" aria-hidden="true" />
        <p>Loading entry details…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={`${className} state-card state-error`} role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        <h3>Couldn’t open this entry</h3>
        <p>{error}</p>
      </section>
    );
  }

  if (!entry) {
    return (
      <section className={`${className} detail-placeholder`}>
        <div className="placeholder-graphic" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>Generated Insight</h2>
        <p>Submit text or select a saved entry to review its summary and tags.</p>
      </section>
    );
  }

  return (
    <article className={className} aria-labelledby={`${variant}-summary-title`}>
      <div className="detail-header">
        <div>
          <h2 id={`${variant}-summary-title`}>Generated Insight</h2>
        </div>
        <div className="detail-actions">
          <time dateTime={entry.created_at}>
            {formatDateTime(entry.created_at)}
          </time>
          {onDelete && (
            <button
              className="delete-entry-button"
              type="button"
              onClick={(event) => onDelete(entry, event.currentTarget)}
              disabled={isDeleting}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <p className="summary-text">{entry.summary}</p>

      <div className="tag-section">
        <h3>Relevant tags</h3>
        <ul className="tag-list">
          {entry.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>

      <details className="original-text">
        <summary>View original text</summary>
        <p>{entry.original_text}</p>
      </details>
    </article>
  );
}

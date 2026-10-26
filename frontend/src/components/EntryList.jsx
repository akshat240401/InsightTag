function formatCompactDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function EntryList({
  entries,
  error,
  isLoading,
  onSelect,
  selectedId,
}) {
  if (isLoading) {
    return (
      <div className="card list-card state-card" aria-live="polite">
        <span className="spinner spinner-dark" aria-hidden="true" />
        <p>Loading saved entries…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card list-card state-card state-error" role="alert">
        <span className="state-icon" aria-hidden="true">!</span>
        <h3>Couldn’t load saved entries</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card list-card state-card">
        <span className="state-icon" aria-hidden="true">+</span>
        <h3>No saved entries yet</h3>
        <p>Your first summary will appear here after you submit some text.</p>
      </div>
    );
  }

  return (
    <div className="card list-card">
      <ul className="entry-list" aria-label="Saved entries">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              className={
                entry.id === selectedId
                  ? "entry-button selected"
                  : "entry-button"
              }
              type="button"
              onClick={() => onSelect(entry.id)}
              aria-pressed={entry.id === selectedId}
            >
              <span className="entry-copy">
                <span className="entry-reference">Entry #{entry.id}</span>
                <strong>{entry.summary}</strong>
                <span className="entry-preview">{entry.original_text}</span>
              </span>
              <span className="mini-tags" aria-label="Tags">
                {entry.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </span>
              <time dateTime={entry.created_at}>
                {formatCompactDate(entry.created_at)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

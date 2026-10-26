import { useState } from "react";

const MAX_TEXT_LENGTH = 10_000;

export default function EntryForm({
  error,
  isSubmitting,
  onSubmit,
  successMessage,
}) {
  const [text, setText] = useState("");
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedText = text.trim();

    if (!normalizedText) {
      setValidationError("Enter some text before submitting.");
      return;
    }

    setValidationError("");
    const wasSuccessful = await onSubmit(normalizedText);
    if (wasSuccessful) setText("");
  }

  function handleChange(event) {
    setText(event.target.value);
    if (validationError) setValidationError("");
  }

  const visibleError = validationError || error;

  return (
    <section className="card composer-card" aria-labelledby="composer-title">
      <div className="card-heading">
        <h2 id="composer-title">New Analysis</h2>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="source-text">Text to summarize</label>
        <textarea
          id="source-text"
          value={text}
          onChange={handleChange}
          maxLength={MAX_TEXT_LENGTH}
          rows="11"
          placeholder="Paste a meeting transcript, article draft, or detailed note…"
          aria-describedby="text-help form-status"
          aria-invalid={Boolean(visibleError)}
          disabled={isSubmitting}
        />

        <div id="text-help" className="input-meta">
          <span>Up to 10,000 characters</span>
          <span
            className={
              text.length > 9_000
                ? "character-count near-limit"
                : "character-count"
            }
          >
            {text.length.toLocaleString()} / 10,000
          </span>
        </div>

        <div id="form-status" className="form-status" aria-live="polite">
          {visibleError && (
            <p className="feedback feedback-error" role="alert">
              <span aria-hidden="true">!</span>
              {visibleError}
            </p>
          )}
          {!visibleError && successMessage && (
            <p className="feedback feedback-success">
              <span aria-hidden="true">✓</span>
              {successMessage}
            </p>
          )}
        </div>

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Generating insight…
            </>
          ) : (
            <>
              Summarize &amp; Save
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </form>
    </section>
  );
}
